import { createRandomToken, hmacSha256Hex, constantTimeEqual } from '$lib/server/auth/tokens';
import { sha256Hex } from '$lib/server/security/digest';
import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { nextBusinessWindow, type BusinessHoursSchedule } from '$lib/server/outbox/business-hours';
import type { Lesson } from '../contracts';
import { IntakeError, intakeInputSchema, validateSubmission } from './validation.server';
import type { IntakeChild, IntakeDetail, IntakeItem, IntakeRequest } from './model.server';
import { telegramParts } from './templates.server';

export const afterSeconds = (now: string, seconds: number) =>
	new Date(Date.parse(now) + seconds * 1000).toISOString();
export const searchName = (v: string) => v.normalize('NFC').toLocaleLowerCase('de-DE');
export function verificationToken(
	secret: string,
	r: Pick<IntakeRequest, 'id' | 'email' | 'verification_version' | 'verification_nonce'>
) {
	return hmacSha256Hex(
		secret,
		'trial-intake:verify:v1',
		JSON.stringify([r.id, r.email, r.verification_version, r.verification_nonce])
	);
}
export function receiptToken(secret: string, r: Pick<IntakeRequest, 'id' | 'receipt_nonce'>) {
	return hmacSha256Hex(
		secret,
		'trial-intake:receipt:v1',
		JSON.stringify([r.id, r.receipt_nonce])
	);
}
export class IntakeService {
	constructor(
		readonly db: DatabaseBoundary,
		private readonly secret: string,
		private readonly schedule: BusinessHoursSchedule,
		private readonly emailMaxAttempts = 5
	) {}
	get(id: string) {
		return this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE id = ?',
			params: [id],
		});
	}
	async detail(id: string): Promise<IntakeDetail | null> {
		const request = await this.get(id);
		if (!request) return null;
		const children = (
			await this.db.all<IntakeChild>({
				sql: 'SELECT * FROM trial_intake_children WHERE request_id = ? ORDER BY position',
				params: [id],
			})
		).results;
		const items = (
			await this.db.all<IntakeItem>({
				sql: 'SELECT * FROM trial_intake_items WHERE request_id = ? ORDER BY position',
				params: [id],
			})
		).results;
		const links = (
			await this.db.all<{ item_id: string; child_id: string }>({
				sql: 'SELECT item_id, child_id FROM trial_intake_item_children WHERE request_id = ?',
				params: [id],
			})
		).results;
		return {
			request,
			children,
			items: items.map((i) => ({
				...i,
				children: children.filter((c) =>
					links.some((l) => l.item_id === i.id && l.child_id === c.id)
				),
			})),
		};
	}
	private emailStatement(id: string, version: number, now: string): StatementSpec {
		return {
			sql: `INSERT OR IGNORE INTO trial_intake_email_outbox
		 (id, request_id, verification_version, kind, dedupe_key, max_attempts, created_at, updated_at)
		 SELECT ?, id, verification_version, 'verification', ?, ?, ?, ? FROM trial_intake_requests
		 WHERE id = ? AND state = 'pending_email' AND verification_version = ?`,
			params: [
				`intake-email:${id}:${version}`,
				`trial-intake:verify:${id}:${version}`,
				this.emailMaxAttempts,
				now,
				now,
				id,
				version,
			],
		};
	}
	async create(
		value: unknown,
		catalog: () => Promise<readonly Lesson[]>,
		now: string,
		closed: (lessons: readonly Lesson[]) => Promise<readonly string[]> = async () => []
	) {
		const parsed = intakeInputSchema.safeParse(value);
		if (!parsed.success) throw new IntakeError('INTAKE_INPUT_INVALID');
		const data = parsed.data;
		for (const item of data.items) item.childKeys.sort();
		const hash = await sha256Hex(JSON.stringify(data));
		const existing = await this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE idempotency_key = ?',
			params: [data.idempotencyKey],
		});
		if (existing) return this.createdResult(existing, hash, now);
		const lessons = await catalog();
		const { items } = validateSubmission(data, lessons, now, await closed(lessons));
		const id = crypto.randomUUID();
		const nonce = createRandomToken();
		const token = await verificationToken(this.secret, {
			id,
			email: data.email,
			verification_version: 1,
			verification_nonce: nonce,
		});
		const statements: StatementSpec[] = [
			{
				sql: `INSERT OR IGNORE INTO trial_intake_requests
		 (id, idempotency_key, payload_hash, parent_first_name, parent_last_name, parent_last_name_search, email, phone,
		 locale, privacy_version, receipt_nonce, verification_version, verification_nonce, verification_hash,
		 verification_expires_at, last_email_at, created_at, pending_expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
				params: [
					id,
					data.idempotencyKey,
					hash,
					data.parentFirstName,
					data.parentLastName,
					searchName(data.parentLastName),
					data.email,
					data.phone,
					data.locale,
					data.privacyVersion,
					createRandomToken(),
					nonce,
					await sha256Hex(token),
					afterSeconds(now, 86400),
					now,
					now,
					afterSeconds(now, 14 * 86400),
				],
			},
		];
		const children = data.children.map((c, position) => ({
			...c,
			id: crypto.randomUUID(),
			position,
			search: searchName(c.lastName),
		}));
		const preparedItems = items.map((item, position) => ({
			...item,
			id: crypto.randomUUID(),
			position,
		}));
		const links = preparedItems.flatMap((item) =>
			item.childKeys.map((key) => ({
				item: item.id,
				child: children.find((c) => c.key === key)!.id,
			}))
		);
		// Constant query count even at 10 children x 10 lessons; each query stays below 100 bindings.
		statements.push({
			sql: `INSERT INTO trial_intake_children
		 (id, request_id, position, first_name, last_name, last_name_search, birth_date)
		 SELECT json_extract(j.value,'$.id'), r.id, json_extract(j.value,'$.position'), json_extract(j.value,'$.firstName'),
		 json_extract(j.value,'$.lastName'), json_extract(j.value,'$.search'), json_extract(j.value,'$.birthDate')
		 FROM trial_intake_requests r, json_each(?) j WHERE r.id = ?`,
			params: [JSON.stringify(children), id],
		});
		statements.push({
			sql: `INSERT INTO trial_intake_items
		 (id, request_id, position, lesson_id, desired_date, subject, group_name, weekday, start_time, end_time, teacher, room, building)
		 SELECT json_extract(j.value,'$.id'), r.id, json_extract(j.value,'$.position'), json_extract(j.value,'$.lessonId'),
		 json_extract(j.value,'$.desiredDate'), json_extract(j.value,'$.lesson.subject'), json_extract(j.value,'$.lesson.group'),
		 json_extract(j.value,'$.lesson.weekday'), json_extract(j.value,'$.lesson.start'), json_extract(j.value,'$.lesson.end'),
		 json_extract(j.value,'$.lesson.teacher'), json_extract(j.value,'$.lesson.room'), json_extract(j.value,'$.lesson.building')
		 FROM trial_intake_requests r, json_each(?) j WHERE r.id = ?`,
			params: [JSON.stringify(preparedItems), id],
		});
		statements.push({
			sql: `INSERT INTO trial_intake_item_children(request_id, item_id, child_id)
		 SELECT r.id, json_extract(j.value,'$.item'), json_extract(j.value,'$.child')
		 FROM trial_intake_requests r, json_each(?) j WHERE r.id = ?`,
			params: [JSON.stringify(links), id],
		});
		statements.push(this.emailStatement(id, 1, now));
		await this.db.batch(statements);
		const result = await this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE idempotency_key = ?',
			params: [data.idempotencyKey],
		});
		if (!result) throw new IntakeError('INTAKE_SAVE_FAILED', 503);
		return this.createdResult(result, hash, now);
	}
	private async createdResult(r: IntakeRequest, hash: string, now: string) {
		if (r.payload_hash !== hash) throw new IntakeError('INTAKE_IDEMPOTENCY_CONFLICT', 409);
		if (r.state === 'pending_email' && r.pending_expires_at <= now)
			throw new IntakeError('INTAKE_EXPIRED', 410);
		return {
			id: r.id,
			receipt: await receiptToken(this.secret, r),
			state: r.state,
			resendAfter: afterSeconds(r.last_email_at, 60),
		};
	}
	async inspectToken(token: string, now: string) {
		if (!/^[a-f0-9]{64}$/u.test(token)) return { state: 'invalid' as const };
		const r = await this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE verification_hash = ?',
			params: [await sha256Hex(token)],
		});
		if (!r || (r.delete_after !== null && r.delete_after <= now))
			return { state: 'invalid' as const };
		if (r.state !== 'pending_email') return { state: 'accepted' as const };
		if (r.pending_expires_at <= now || r.verification_expires_at <= now)
			return { state: 'expired' as const };
		return { state: 'confirm' as const };
	}
	async verify(token: string, now: string) {
		const inspection = await this.inspectToken(token, now);
		if (inspection.state === 'accepted') return inspection;
		if (inspection.state !== 'confirm') throw new IntakeError('INTAKE_TOKEN_INVALID', 410);
		const hash = await sha256Hex(token);
		const r = await this.db.first<IntakeRequest>({
			sql: 'SELECT * FROM trial_intake_requests WHERE verification_hash = ?',
			params: [hash],
		});
		if (!r) throw new IntakeError('INTAKE_TOKEN_INVALID', 410);
		const detail = await this.detail(r.id);
		if (!detail) throw new IntakeError('INTAKE_TOKEN_INVALID', 410);
		const parts = telegramParts(detail);
		const statements: StatementSpec[] = [
			{
				sql: `UPDATE trial_intake_requests SET state = 'verified', verified_at = ?
		 WHERE id = ? AND verification_hash = ? AND state = 'pending_email' AND verification_expires_at > ? AND pending_expires_at > ?`,
				params: [now, r.id, hash, now, now],
			},
		];
		parts.forEach((body, index) => {
			const payloadId = `${r.id}:${index + 1}`;
			statements.push({
				sql: `INSERT OR IGNORE INTO trial_intake_telegram_payloads(id, request_id, part, total, body)
			 SELECT ?, id, ?, ?, ? FROM trial_intake_requests WHERE id = ? AND state = 'verified' AND verification_hash = ?`,
				params: [payloadId, index + 1, parts.length, body, r.id, hash],
			});
			statements.push({
				sql: `INSERT OR IGNORE INTO telegram_outbox
			 (id, source_kind, source_id, template_or_category, payload_json, dedupe_key, not_before, created_at, updated_at)
			 SELECT ?, 'trial_intake', request_id, 'bureau.trial_intake', ?, ?, ?, ?, ? FROM trial_intake_telegram_payloads WHERE id = ?`,
				params: [
					// Keep the operator-searchable ID below D1's 50-byte LIKE pattern limit.
					`ti:${payloadId}`,
					JSON.stringify({ payloadId }),
					`trial-intake:telegram:${payloadId}`,
					nextBusinessWindow(now, this.schedule),
					now,
					now,
					payloadId,
				],
			});
		});
		statements.push({
			sql: `UPDATE trial_intake_email_outbox SET status = 'cancelled', updated_at = ?
		 WHERE request_id = ? AND kind = 'verification' AND status IN ('pending','retry')
		 AND EXISTS (SELECT 1 FROM trial_intake_requests WHERE id = ? AND state <> 'pending_email')`,
			params: [now, r.id, r.id],
		});
		// Version 0 is reserved for this row, so UNIQUE(request_id, verification_version) holds.
		statements.push({
			sql: `INSERT OR IGNORE INTO trial_intake_email_outbox
		 (id, request_id, verification_version, kind, dedupe_key, max_attempts, created_at, updated_at)
		 SELECT ?, id, 0, 'confirmation', ?, ?, ?, ? FROM trial_intake_requests
		 WHERE id = ? AND state = 'verified' AND verification_hash = ?`,
			params: [
				`intake-email:${r.id}:confirm`,
				`trial-intake:confirm:${r.id}`,
				this.emailMaxAttempts,
				now,
				now,
				r.id,
				hash,
			],
		});
		await this.db.batch(statements);
		if ((await this.inspectToken(token, now)).state !== 'accepted')
			throw new IntakeError('INTAKE_TOKEN_INVALID', 410);
		return { state: 'accepted' as const };
	}
	async resend(id: string, receipt: string, now: string) {
		const r = await this.get(id);
		if (!r || !constantTimeEqual(await receiptToken(this.secret, r), receipt))
			throw new IntakeError('INTAKE_RECEIPT_INVALID', 403);
		if (r.state !== 'pending_email') return { state: 'accepted' as const };
		if (r.pending_expires_at <= now) throw new IntakeError('INTAKE_EXPIRED', 410);
		if (afterSeconds(r.last_email_at, 60) > now)
			throw new IntakeError('INTAKE_RESEND_COOLDOWN', 429);
		const version = r.verification_version + 1;
		const nonce = createRandomToken();
		const hash = await sha256Hex(
			await verificationToken(this.secret, {
				...r,
				verification_version: version,
				verification_nonce: nonce,
			})
		);
		const result = await this.db.batch([
			{
				sql: `UPDATE trial_intake_requests SET verification_version = ?, verification_nonce = ?,
		 verification_hash = ?, verification_expires_at = ?, last_email_at = ?
		 WHERE id = ? AND state = 'pending_email' AND verification_version = ? AND pending_expires_at > ?
		 AND NOT EXISTS(SELECT 1 FROM trial_intake_email_outbox WHERE request_id = ? AND status = 'processing')`,
				params: [
					version,
					nonce,
					hash,
					afterSeconds(now, 86400),
					now,
					id,
					r.verification_version,
					now,
					id,
				],
			},
			{
				sql: `UPDATE trial_intake_email_outbox SET status = 'cancelled', updated_at = ? WHERE request_id = ? AND status IN ('pending','retry')
		 AND verification_version < (SELECT verification_version FROM trial_intake_requests WHERE id = ?)`,
				params: [now, id, id],
			},
			this.emailStatement(id, version, now),
		]);
		if (!result[0].meta.changes) throw new IntakeError('INTAKE_RESEND_BUSY', 409);
		return { state: 'pending_email' as const, resendAfter: afterSeconds(now, 60) };
	}
}
