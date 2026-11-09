import type { RequestEvent } from '@sveltejs/kit';
import { strToU8 } from 'fflate';
import { WaitlistPrices } from '$lib/trial-intake/server/prices.server';
import {
	adminWaitlistExport,
	adminWaitlistImport,
	adminWaitlistPrice,
	intakeEndpoint,
} from '$lib/trial-intake/server/http.server';
import { lessonIdentity } from '$lib/trial-intake/server/catalog.server';
import { IntakeAdmin } from '$lib/trial-intake/server/admin.server';
import { plannedCourseKey } from '$lib/trial-intake/planned';
import { hashCsrfToken } from '$lib/server/auth/tokens';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '$lib/trial-intake/contracts';
import {
	useIntakeD1,
	NOW,
	SECRET,
	actor,
	ctx,
	db,
	service,
	data,
	lessons,
	seedAdmin,
} from './intake-harness';

useIntakeD1();

const PLANNED = 'Der Kurs befindet sich in der Planung';
async function lesson(fields: Partial<Lesson>): Promise<Lesson> {
	const value = {
		subject: 'English',
		group: PLANNED,
		weekday: 2,
		start: '16:00',
		end: '17:00',
		teacher: 'Lehrkraft A',
		room: 'R1',
		building: 'Villa' as const,
		...fields,
	};
	return { id: await lessonIdentity(value), ...value };
}
const parent = { ...actor, id: 'synthetic-parent', role: 'parent' as const };
async function seedParent() {
	await db.run({
		sql: `INSERT INTO users(id,email,email_normalized,password_hash,email_verified_at,role,first_name,last_name,first_name_normalized,last_name_normalized,privacy_notice_version,privacy_accepted_at,created_at,updated_at)
	 VALUES (?, 'parent@example.test','parent@example.test','synthetic-hash',?,'parent','Synthetic','Parent','synthetic','parent','test',?,?,?)`,
		params: [parent.id, NOW, NOW, NOW, NOW],
	});
}
let sequence = 0;
/** A request row with `children` children; the waitlist entry is inserted by each test. */
async function request(state: 'pending_email' | 'verified', children = 1) {
	const id = `synthetic-request-${++sequence}`;
	await db.run({
		sql: `INSERT INTO trial_intake_requests(id, idempotency_key, payload_hash, parent_first_name, parent_last_name,
		 parent_last_name_search, email, phone, locale, privacy_version, state, receipt_nonce, verification_version,
		 verification_nonce, verification_hash, verification_expires_at, last_email_at, created_at, pending_expires_at,
		 verified_at, kind)
		 VALUES (?, ?, 'h', 'Synthetic', 'Parent', 'parent', 'guest@example.test', '+49 000000000', 'de', ?, ?, 'n', 1, 'n', ?, ?, ?, ?, ?, ?, 'waitlist')`,
		params: [
			id,
			id,
			INTAKE_PRIVACY_VERSION,
			state,
			`hash-${id}`,
			NOW,
			NOW,
			NOW,
			NOW,
			state === 'verified' ? NOW : null,
		],
	});
	for (let i = 0; i < children; i++)
		await db.run({
			sql: `INSERT INTO trial_intake_children(id, request_id, position, first_name, last_name, last_name_search, birth_date)
			 VALUES (?, ?, ?, 'Kind', 'Synthetic', 'synthetic', '2018-01-01')`,
			params: [`${id}-child-${i}`, id, i],
		});
	return id;
}
function entry(requestId: string, key: string, monthly = 6650, yearly = 5905, status = 'waiting') {
	return db.run({
		sql: `INSERT INTO trial_intake_waitlist_entries(request_id, course_key, lesson_json, tariff, monthly_cents, yearly_cents,
		 min_participants, consent_version, status, withdraw_nonce, withdraw_hash, created_at, status_changed_at)
		 VALUES (?, ?, '{}', 'monthly', ?, ?, 3, 'consent-v1', ?, 'nonce', ?, ?, ?)`,
		params: [requestId, key, monthly, yearly, status, `withdraw-${requestId}`, NOW, NOW],
	});
}
function price(key: string, monthly = 6650, yearly = 5905) {
	return db.run({
		sql: `INSERT INTO trial_intake_planned_prices(course_key, subject, weekday, start_time, end_time, teacher, building, room,
		 monthly_cents, yearly_cents, updated_by, created_at, updated_at)
		 VALUES (?, 'English', 2, '16:00', '17:00', 'Lehrkraft A', 'Villa', 'R1', ?, ?, ?, ?, ?)`,
		params: [key, monthly, yearly, actor.id, NOW, NOW],
	});
}
function journal(from: string, to: string, kind: string, sums: [number, number, number, number]) {
	return db.run({
		sql: `INSERT INTO trial_intake_waitlist_rebinds(id, from_key, to_key, from_lesson_json, to_lesson_json, kind,
		 differences_json, from_monthly_cents, from_yearly_cents, to_monthly_cents, to_yearly_cents, actor_user_id, created_at)
		 VALUES (?, ?, ?, '{}', '{}', ?, '[]', ?, ?, ?, ?, ?, ?)`,
		params: [crypto.randomUUID(), from, to, kind, ...sums, actor.id, NOW],
	});
}
const count = async (sql: string, params: unknown[] = []) =>
	(await db.first<{ n: number }>({ sql: `SELECT COUNT(*) AS n FROM ${sql}`, params }))?.n;

describe('waitlist migration 0032 and the price contour (WL-06)', () => {
	it('creates the schema; existing and new trial requests keep kind trial', async () => {
		for (const table of [
			'trial_intake_planned_prices',
			'trial_intake_waitlist_entries',
			'trial_intake_waitlist_starts',
			'trial_intake_waitlist_rebinds',
			'trial_intake_waitlist_price_confirmations',
			'trial_intake_waitlist_email_outbox',
			'trial_intake_waitlist_documents',
			'trial_intake_waitlist_render_usage',
		])
			expect(
				await count(`sqlite_master WHERE type = 'table' AND name = ?`, [table]),
				table
			).toBe(1);
		expect(
			await count(
				`sqlite_master WHERE type = 'trigger' AND name LIKE 'trial_intake_waitlist_%'`
			)
		).toBe(7);
		const receipt = await service.create(data(), async () => lessons, NOW);
		expect(
			(
				await db.first({
					sql: 'SELECT kind FROM trial_intake_requests WHERE id = ?',
					params: [receipt.id],
				})
			)?.kind
		).toBe('trial');
		await expect(
			db.run({
				sql: `UPDATE trial_intake_requests SET kind = 'other' WHERE id = ?`,
				params: [receipt.id],
			})
		).rejects.toThrow();
	});
	it('the seven triggers refuse every bypass of a sum a family agreed to', async () => {
		await seedAdmin();
		const key = plannedCourseKey(await lesson({}));
		const moved = plannedCourseKey(await lesson({ building: 'Kolibri' }));
		const longer = plannedCourseKey(await lesson({ building: 'Kolibri', end: '17:30' }));
		await price(key);
		const first = await request('verified', 2);
		// 2. The entry must carry the current sums.
		await expect(entry(first, key, 6600)).rejects.toThrow(
			'waitlist entry price does not match'
		);
		await entry(first, key);
		// 4 and 5. Sums, key and the row itself are locked; the threshold is not.
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_planned_prices SET monthly_cents = 7000 WHERE course_key = ?',
				params: [key],
			})
		).rejects.toThrow('waitlist price locked');
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_planned_prices SET course_key = ? WHERE course_key = ?',
				params: [moved, key],
			})
		).rejects.toThrow('waitlist price locked');
		await expect(
			db.run({
				sql: 'DELETE FROM trial_intake_planned_prices WHERE course_key = ?',
				params: [key],
			})
		).rejects.toThrow('waitlist price locked');
		await db.run({
			sql: 'UPDATE trial_intake_planned_prices SET min_participants = 5 WHERE course_key = ?',
			params: [key],
		});
		// 1. The snapshot is immutable; the status is not.
		for (const set of [
			'monthly_cents = 1',
			"tariff = 'yearly'",
			"lesson_json = '[]'",
			"withdraw_hash = 'x'",
			'min_participants = 4',
		])
			await expect(
				db.run({
					sql: `UPDATE trial_intake_waitlist_entries SET ${set} WHERE request_id = ?`,
					params: [first],
				})
			).rejects.toThrow('waitlist snapshot is immutable');
		// 6. A key change needs a journal row; 7. the journal records the real sums.
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
				params: [moved, first],
			})
		).rejects.toThrow('waitlist rebind requires a journal row');
		await expect(journal(key, moved, 'plain', [6650, 5905, 7000, 5905])).rejects.toThrow(
			'keeps the sums'
		);
		await expect(journal(key, moved, 'price', [6650, 5905, 6650, 5905])).rejects.toThrow(
			'requires a duration change'
		);
		await expect(journal(key, longer, 'notify', [6650, 5905, 9000, 8000])).rejects.toThrow(
			'requires a duration change'
		);
		await expect(journal(key, moved, 'plain', [1000, 1000, 1000, 1000])).rejects.toThrow(
			'must record the current price'
		);
		await journal(key, moved, 'plain', [6650, 5905, 6650, 5905]);
		// The target price must equal the journal when the entry moves.
		await price(moved, 6650, 6000);
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
				params: [moved, first],
			})
		).rejects.toThrow('waitlist rebind requires a journal row');
		await db.run({
			sql: 'UPDATE trial_intake_planned_prices SET yearly_cents = 5905 WHERE course_key = ?',
			params: [moved],
		});
		await db.run({
			sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
			params: [moved, first],
		});
		// The old course is free again, the new one is locked.
		await db.run({
			sql: 'DELETE FROM trial_intake_planned_prices WHERE course_key = ?',
			params: [key],
		});
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_planned_prices SET yearly_cents = 1 WHERE course_key = ?',
				params: [moved],
			})
		).rejects.toThrow('waitlist price locked');
		// Only a duration change may carry new sums.
		await price(longer, 9000, 8000);
		await journal(moved, longer, 'price', [6650, 5905, 9000, 8000]);
		await db.run({
			sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
			params: [longer, first],
		});
		// 3. A started course takes no new entry until it is opened again.
		await db.run({
			sql: `INSERT INTO trial_intake_waitlist_starts(id, course_key, first_date, lesson_json, participants, started_by, started_at)
			 VALUES ('start-1', ?, '2026-11-24', '{}', 2, ?, ?)`,
			params: [longer, actor.id, NOW],
		});
		await db.run({
			sql: `UPDATE trial_intake_waitlist_entries SET status = 'started', start_id = 'start-1' WHERE request_id = ?`,
			params: [first],
		});
		const second = await request('pending_email');
		await expect(entry(second, longer, 9000, 8000)).rejects.toThrow(
			'waitlist course already started'
		);
		await expect(
			db.run({
				sql: 'UPDATE trial_intake_waitlist_entries SET course_key = ? WHERE request_id = ?',
				params: [moved, first],
			})
		).rejects.toThrow('only a waiting entry');
		// No waiting entry is left: the price can change again.
		await db.run({
			sql: 'UPDATE trial_intake_planned_prices SET monthly_cents = 9500 WHERE course_key = ?',
			params: [longer],
		});
		await db.run({
			sql: `UPDATE trial_intake_waitlist_starts SET reopened_at = ?, reopened_by = ? WHERE id = 'start-1'`,
			params: [NOW, actor.id],
		});
		await expect(entry(second, longer, 9500, 8000, 'started')).rejects.toThrow(
			'waitlist entry must start waiting'
		);
		await entry(second, longer, 9500, 8000);
		// Deleting the request removes its entry and with it the lock.
		await db.run({ sql: 'DELETE FROM trial_intake_requests WHERE id = ?', params: [second] });
		await db.run({
			sql: 'DELETE FROM trial_intake_planned_prices WHERE course_key = ?',
			params: [longer],
		});
		expect((await db.all({ sql: 'PRAGMA foreign_key_check' })).results).toEqual([]);
	});
});
describe('waitlist prices and statuses (WL-05, WL-07)', () => {
	it('lists planned courses with statuses and refuses a locked price', async () => {
		await seedAdmin();
		const prices = new WaitlistPrices(db);
		const english = await lesson({});
		const english1 = await lesson({ group: `${PLANNED} 1`, room: 'R9' }); // the same course
		const baby = await lesson({
			subject: 'Baby',
			weekday: 4,
			end: '16:45',
			group: `${PLANNED}2`,
		});
		const regular = await lesson({ subject: 'English', group: 'English Di', weekday: 3 });
		const catalog = [english, baby, regular];
		let view = await prices.overview(actor, catalog);
		expect(view.courses.map((c) => [c.course.subject, c.status])).toEqual([
			['English', 'price_missing'],
			['Baby', 'price_missing'],
		]);
		expect(
			await prices.setPrice(
				actor,
				english,
				{ monthlyCents: 6650, yearlyCents: 5905, minParticipants: 2 },
				'r',
				NOW
			)
		).toEqual({
			changed: true,
		});
		// Repeating the same values writes nothing.
		expect(
			await prices.setPrice(
				actor,
				english,
				{ monthlyCents: 6650, yearlyCents: 5905, minParticipants: 2 },
				'r',
				NOW
			)
		).toEqual({
			changed: false,
		});
		const key = plannedCourseKey(english);
		const unconfirmed = await request('pending_email', 3);
		await entry(unconfirmed, key);
		view = await prices.overview(actor, catalog);
		expect(view.courses[0]).toMatchObject({
			status: 'collecting',
			children: 0,
			unconfirmedChildren: 3,
			activeEntries: 1,
		});
		await expect(
			prices.setPrice(
				actor,
				english,
				{ monthlyCents: 7000, yearlyCents: 5905, minParticipants: 2 },
				'r',
				NOW
			)
		).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_LOCKED',
			status: 409,
			details: { activeEntries: 1 },
		});
		await expect(prices.deletePrice(actor, key, 'r', NOW)).rejects.toMatchObject({
			code: 'WAITLIST_PRICE_LOCKED',
		});
		// The threshold is not part of the consent and stays editable.
		await prices.setPrice(
			actor,
			english,
			{ monthlyCents: 6650, yearlyCents: 5905, minParticipants: 1 },
			'r',
			NOW
		);
		const confirmed = await request('verified', 1);
		await entry(confirmed, key);
		view = await prices.overview(actor, catalog);
		expect(view.courses[0]).toMatchObject({
			status: 'ready',
			children: 1,
			waitingFamilies: 1,
			activeEntries: 2,
		});
		// Two planned cards of one course, a closed course, a start, a vanished queue, no schedule.
		expect((await prices.overview(actor, [english, english1, baby])).courses[0].status).toBe(
			'ambiguous'
		);
		await new IntakeAdmin(service).setLessonClosed(actor, english, true, 'r', NOW);
		expect((await prices.overview(actor, catalog)).courses[0].status).toBe('closed');
		await new IntakeAdmin(service).setLessonClosed(actor, english, false, 'r', NOW);
		view = await prices.overview(actor, [baby]);
		expect(view.unscheduled).toMatchObject([
			{ key, status: 'gone', activeEntries: 2, course: { subject: 'English', room: 'R1' } },
		]);
		view = await prices.overview(actor, null);
		expect(view).toMatchObject({
			catalogError: true,
			courses: [],
			unscheduled: [{ key, status: null }],
		});
		await db.run({ sql: `UPDATE trial_intake_waitlist_entries SET status = 'withdrawn'` });
		expect((await prices.overview(actor, [baby])).unscheduled[0].status).toBe(
			'not_in_schedule'
		);
		await db.run({
			sql: `INSERT INTO trial_intake_waitlist_starts(id, course_key, first_date, lesson_json, participants, started_by, started_at)
			 VALUES ('s', ?, '2026-11-24', '{}', 1, ?, ?)`,
			params: [key, actor.id, NOW],
		});
		expect((await prices.overview(actor, catalog)).courses[0]).toMatchObject({
			status: 'started',
			firstDate: '2026-11-24',
		});
		expect(await prices.deletePrice(actor, key, 'r', NOW)).toEqual({ deleted: true });
		expect(await prices.deletePrice(actor, key, 'r', NOW)).toEqual({ deleted: false });
		await expect(
			prices.setPrice(
				actor,
				regular,
				{ monthlyCents: 1, yearlyCents: 1, minParticipants: 1 },
				'r',
				NOW
			)
		).rejects.toMatchObject({ code: 'WAITLIST_LESSON_NOT_PLANNED' });
		const audit = (
			await db.all<{ action: string; target_id: string; safe_diff_json: string }>({
				sql: `SELECT action, target_id, safe_diff_json FROM audit_events WHERE action LIKE 'trial_intake.waitlist_%' ORDER BY rowid`,
			})
		).results;
		expect(audit.map((a) => a.action)).toEqual([
			'trial_intake.waitlist_price_set',
			'trial_intake.waitlist_price_set',
			'trial_intake.waitlist_price_deleted',
		]);
		expect(JSON.parse(audit[0].safe_diff_json)).toEqual({
			key,
			before: null,
			after: { monthlyCents: 6650, yearlyCents: 5905, minParticipants: 2 },
		});
		expect(JSON.parse(audit[2].safe_diff_json)).toMatchObject({
			before: { monthlyCents: 6650 },
			after: null,
		});
		expect(
			audit.every((a) => a.target_id === key && !a.safe_diff_json.includes('guest@'))
		).toBe(true);
	});
	it('refuses anonymous and non-admin users', async () => {
		await seedAdmin();
		await seedParent();
		const prices = new WaitlistPrices(db);
		const english = await lesson({});
		await expect(prices.overview(undefined, [english])).rejects.toMatchObject({
			code: 'AUTHENTICATION_REQUIRED',
		});
		await expect(prices.overview(parent, [english])).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		const values = { monthlyCents: 1, yearlyCents: 1, minParticipants: 1 };
		await expect(prices.setPrice(parent, english, values, 'r', NOW)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		await expect(prices.deletePrice(parent, 'x', 'r', NOW)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		await expect(
			prices.previewImport(parent, new Uint8Array(), 'a.csv', [english])
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(prices.applyImport(parent, [], [english], 'r', NOW)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		// A blocked admin keeps the session role but is refused by the account check.
		await db.run({ sql: 'UPDATE users SET is_blocked = 1 WHERE id = ?', params: [actor.id] });
		await expect(prices.setPrice(actor, english, values, 'r', NOW)).rejects.toMatchObject({
			code: 'FORBIDDEN',
		});
		expect(await count('trial_intake_planned_prices')).toBe(0);
	});
	it('a trial request for a planned course is refused before anything is written', async () => {
		const planned = await lesson({});
		const input = data();
		input.items = [{ lessonId: planned.id, desiredDate: '2026-09-22', childKeys: ['child-a'] }];
		await expect(
			service.create(input, async () => [...lessons, planned], NOW)
		).rejects.toMatchObject({
			code: 'INTAKE_LESSON_PLANNED',
			status: 409,
		});
		expect(await count('trial_intake_requests')).toBe(0);
	});
});
describe('waitlist price import (WL-05)', () => {
	it('previews by row, applies only new and changed rows, repeats as a no-op and keeps locks', async () => {
		await seedAdmin();
		const prices = new WaitlistPrices(db);
		const english = await lesson({});
		const baby = await lesson({
			subject: 'Baby',
			weekday: 4,
			end: '16:45',
			building: 'Kolibri',
		});
		const oneE = await lesson({ subject: '1 E', end: '16:45', teacher: 'Lehrkraft B' });
		const catalog = [english, baby, oneE, await lesson({ group: 'English Di', weekday: 5 })];
		await prices.setPrice(
			actor,
			oneE,
			{ monthlyCents: 4000, yearlyCents: 3500, minParticipants: 3 },
			'r',
			NOW
		);
		await entry(await request('verified'), plannedCourseKey(oneE), 4000, 3500);
		const csv = (lines: string[]) =>
			strToU8(
				[
					'Fach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Raum;Monatsvertrag €/Monat;Jahresvertrag €/Monat;Mindestteilnehmer;Status',
					...lines,
				].join('\r\n')
			);
		const file = csv([
			'english;Di;16:00–17:00;Villa;lehrkraft a;R7;66,50;59,05;;egal',
			'Baby;Donnerstag;16:00-16:45;Kolibri;Lehrkraft A;;45;40;4;',
			'1 E;2;16:00-16:45;Villa;Lehrkraft B;;41;35;5;',
			'Kunst;Mo;10:00-11:00;Villa;Lehrkraft A;;10;10;3;',
			'English;Fr;16:00-17:00;Villa;Lehrkraft A;;10;10;3;',
			'Baby;Do;16:00-16:45;Kolibri;Lehrkraft A;;46;41;;',
			'English;Di;16:00-17:00;Villa;Lehrkraft A;;66,5;;;',
			'English;Xx;16:00-17:00;Villa;Lehrkraft A;;1;1;;',
		]);
		const preview = await prices.previewImport(actor, file, 'preise.csv', catalog);
		expect(preview.rows.map((r) => [r.line, r.outcome, r.reason])).toEqual([
			[2, 'new', null],
			[3, 'new', null],
			[4, 'locked', null],
			[5, 'unknown', null],
			[6, 'unknown', null], // a regular, not a planned card
			[7, 'error', 'WAITLIST_IMPORT_DUPLICATE'],
			[8, 'error', 'WAITLIST_IMPORT_DUPLICATE'],
			[9, 'error', 'WAITLIST_IMPORT_COURSE_INVALID'],
		]);
		expect(preview.changes).toEqual([
			{
				key: plannedCourseKey(english),
				monthlyCents: 6650,
				yearlyCents: 5905,
				minParticipants: 3,
			},
			{
				key: plannedCourseKey(baby),
				monthlyCents: 4500,
				yearlyCents: 4000,
				minParticipants: 4,
			},
		]);
		expect(await count('trial_intake_planned_prices')).toBe(1);
		// The server checks again: a forged change of the locked course and an unknown key are skipped.
		const forged = [
			...preview.changes,
			{
				key: plannedCourseKey(oneE),
				monthlyCents: 4100,
				yearlyCents: 3500,
				minParticipants: 5,
			},
			{ key: '["unknown"]', monthlyCents: 1, yearlyCents: 1, minParticipants: 1 },
		];
		expect(await prices.applyImport(actor, forged, catalog, 'r', NOW)).toEqual({
			applied: 2,
			skipped: 2,
		});
		expect(
			(
				await db.first({
					sql: 'SELECT monthly_cents FROM trial_intake_planned_prices WHERE course_key = ?',
					params: [plannedCourseKey(oneE)],
				})
			)?.monthly_cents
		).toBe(4000);
		// The same file again: everything is unchanged and nothing is written.
		const again = await prices.previewImport(actor, file, 'preise.csv', catalog);
		expect(again.rows.slice(0, 2).map((r) => r.outcome)).toEqual(['same', 'same']);
		expect(again.changes).toEqual([]);
		expect(await prices.applyImport(actor, preview.changes, catalog, 'r', NOW)).toEqual({
			applied: 0,
			skipped: 2,
		});
		const audit = (
			await db.all<{ safe_diff_json: string }>({
				sql: `SELECT safe_diff_json FROM audit_events WHERE action = 'trial_intake.waitlist_prices_imported'`,
			})
		).results;
		expect(audit).toHaveLength(1);
		expect(JSON.parse(audit[0].safe_diff_json)).toMatchObject({
			applied: 2,
			rows: [{ before: null }, { before: null }],
		});
		// Both sums empty is "no change", one of them is an error of the row.
		const partial = await prices.previewImport(
			actor,
			csv([
				'English;Di;16:00-17:00;Villa;Lehrkraft A;;;;;',
				'Baby;Do;16:00-16:45;Kolibri;Lehrkraft A;;45;;;',
			]),
			'preise.csv',
			catalog
		);
		expect(partial.rows.map((r) => [r.outcome, r.reason])).toEqual([
			['same', null],
			['error', 'WAITLIST_IMPORT_ONE_PRICE'],
		]);
		const invalid = await prices.previewImport(
			actor,
			csv([
				'English;Di;16:00-17:00;Villa;Lehrkraft A;;1.000;1;;',
				'Baby;Do;16:00-16:45;Kolibri;Lehrkraft A;;45;40;31;',
			]),
			'preise.csv',
			catalog
		);
		expect(invalid.rows.map((r) => r.reason)).toEqual([
			'WAITLIST_IMPORT_PRICE_INVALID',
			'WAITLIST_IMPORT_THRESHOLD_INVALID',
		]);
	});
});
describe('waitlist admin HTTP boundary (WL-AC-12)', () => {
	const csrf = 'synthetic-csrf-token';
	async function setup() {
		await seedAdmin();
		await seedParent();
		const english = await lesson({});
		const regular = await lesson({ group: 'English Di', weekday: 3 });
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						`<script id="trial-intake-catalog" type="application/json">${JSON.stringify({ version: 1, lessons: [english, regular] })}</script>`
					)
			)
		);
		return { english, user: { ...actor, csrfHash: await hashCsrfToken(csrf) } };
	}
	function event(path: string, user: unknown, body?: unknown, cookie = csrf) {
		return {
			platform: {
				env: {
					APP_ENV: 'test',
					DB: ctx.db,
					PORTAL_PUBLIC_ORIGIN: 'https://portal.example.test',
					PORTAL_MODE: 'trial_intake',
					TRIAL_INTAKE_SCHEDULE_URL: 'https://schedule.example.test/',
					TRIAL_INTAKE_ACCEPTING: 'true',
					JWT_SECRET: SECRET,
					AUTH_PUBLIC_ENABLED: 'true',
					PRIVACY_NOTICE_VERSION: INTAKE_PRIVACY_VERSION,
					EMAIL_PROVIDER: 'fake',
				},
			},
			url: new URL(`https://portal.example.test${path}`),
			locals: { requestId: 'synthetic', user },
			getClientAddress: () => '192.0.2.1',
			cookies: { get: (name: string) => (name === 'kolibri_csrf' ? cookie : undefined) },
			request: new Request(`https://portal.example.test${path}`, {
				method: body ? 'POST' : 'GET',
				headers: {
					origin: 'https://portal.example.test',
					'content-type': 'application/json',
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		} as unknown as RequestEvent;
	}
	const path = '/admin/trial-intake/warteliste';
	it('requires an admin session and CSRF, writes the price and exports it', async () => {
		const { english, user } = await setup();
		const body = {
			lessonId: english.id,
			monthly: '66,50',
			yearly: '59.05',
			minParticipants: '3',
			_csrf: csrf,
		};
		const status = async (e: RequestEvent) =>
			(await intakeEndpoint(() => adminWaitlistPrice(e))).status;
		expect(await status(event(path, undefined, body))).toBe(401);
		expect(await status(event(path, { ...parent, csrfHash: user.csrfHash }, body))).toBe(403);
		expect(await status(event(path, user, { ...body, _csrf: undefined }))).toBe(403);
		expect(await status(event(path, user, body, 'other-cookie'))).toBe(403);
		expect(await status(event(path, user, { ...body, monthly: '1.000,00' }))).toBe(400);
		expect(await count('trial_intake_planned_prices')).toBe(0);
		const ok = await intakeEndpoint(() => adminWaitlistPrice(event(path, user, body)));
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ changed: true });
		const csv = await adminWaitlistExport(event(`${path}/preise.csv`, user), 'csv');
		expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(csv.headers.get('content-disposition')).toContain('Warteliste-Preise.csv');
		expect(await csv.text()).toContain(
			'English;Dienstag;16:00–17:00;Villa;Lehrkraft A;R1;66,50;59,05;3;sammelt: 0 von 3 Kindern'
		);
		expect(
			(await adminWaitlistExport(event(`${path}/preise.xlsx`, undefined), 'xlsx')).status
		).toBe(401);
		const xlsx = await adminWaitlistExport(event(`${path}/preise.xlsx`, user), 'xlsx');
		expect(new Uint8Array(await xlsx.arrayBuffer()).slice(0, 2)).toEqual(
			new Uint8Array([0x50, 0x4b])
		);
		// A lock refusal names the number of active entries.
		await entry(await request('pending_email'), plannedCourseKey(english));
		const locked = await intakeEndpoint(() =>
			adminWaitlistPrice(event(path, user, { ...body, monthly: '70' }))
		);
		expect(locked.status).toBe(409);
		expect(await locked.json()).toEqual({ code: 'WAITLIST_PRICE_LOCKED', activeEntries: 1 });
	});
	it('imports through the two HTTP steps with CSRF', async () => {
		const { english, user } = await setup();
		const file =
			'Fach;Wochentag;Uhrzeit;Gebäude;Lehrkraft;Monatsvertrag;Jahresvertrag\r\nEnglish;Di;16:00-17:00;Villa;Lehrkraft A;30;25\r\n';
		const content = btoa(String.fromCharCode(...strToU8(file)));
		const importPath = `${path}/import`;
		expect(
			(
				await intakeEndpoint(() =>
					adminWaitlistImport(event(importPath, user, { fileName: 'p.csv', content }))
				)
			).status
		).toBe(403);
		const preview = await intakeEndpoint(() =>
			adminWaitlistImport(
				event(importPath, user, { fileName: 'p.csv', content, _csrf: csrf })
			)
		);
		const { changes } = (await preview.json()) as { changes: unknown[] };
		expect(changes).toEqual([
			{
				key: plannedCourseKey(english),
				monthlyCents: 3000,
				yearlyCents: 2500,
				minParticipants: 3,
			},
		]);
		expect(await count('trial_intake_planned_prices')).toBe(0);
		const applied = await intakeEndpoint(() =>
			adminWaitlistImport(event(importPath, user, { action: 'apply', changes, _csrf: csrf }))
		);
		expect(await applied.json()).toEqual({ applied: 1, skipped: 0 });
		const bad = await intakeEndpoint(() =>
			adminWaitlistImport(
				event(importPath, user, { fileName: 'p.xlsm', content, _csrf: csrf })
			)
		);
		expect(bad.status).toBe(422);
		expect(await bad.json()).toEqual({ code: 'WAITLIST_IMPORT_MACRO' });
	});
});
