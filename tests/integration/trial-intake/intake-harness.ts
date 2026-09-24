import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import { createMigratedTestD1, type TestD1Context } from '../../helpers/d1';
import { DatabaseBoundary } from '$lib/server/db/database';
import { IntakeService, verificationToken } from '$lib/trial-intake/server/service.server';
import { parseBusinessHours } from '$lib/server/outbox/business-hours';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '$lib/trial-intake/contracts';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { afterEach, beforeEach, vi } from 'vitest';

// Shared fixture of the trial-intake D1 integration tests. They are split into several files
// so Vitest runs them in parallel; each file calls useIntakeD1() for a fresh migrated D1 per
// test. `ctx`, `db` and `service` are live bindings reassigned before every test.
export const NOW = '2026-09-16T12:00:00.000Z';
export const SECRET = 'synthetic-intake-test-secret-32-characters';
export const schedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
export const lessons = fixture.lessons as Lesson[];
export let ctx: TestD1Context;
export let db: DatabaseBoundary;
export let service: IntakeService;
export const actor = {
	id: 'synthetic-admin',
	role: 'admin' as const,
	emailVerified: true,
	sessionId: 's',
	sessionVersion: 1,
	csrfHash: 'a'.repeat(64),
};
export function data() {
	return {
		idempotencyKey: crypto.randomUUID(),
		parentFirstName: 'Synthetic',
		parentLastName: 'Parent',
		email: 'guest@example.test',
		phone: '+49 000000000',
		locale: 'de' as const,
		privacyVersion: INTAKE_PRIVACY_VERSION,
		children: [
			{ key: 'child-a', firstName: 'Kind', lastName: 'Zulu', birthDate: '2020-02-29' },
			{ key: 'child-b', firstName: 'Kind', lastName: 'Alpha', birthDate: '2021-01-01' },
		],
		items: [
			{
				lessonId: lessons[0].id,
				desiredDate: '2026-09-17',
				childKeys: ['child-a', 'child-b'],
			},
			{ lessonId: lessons[1].id, desiredDate: '2026-09-19', childKeys: ['child-a'] },
		],
	};
}
/** Long names split the Telegram notification into several parts. */
export function multiPartData() {
	const input = data();
	input.children = Array.from({ length: 10 }, (_, i) => ({
		key: `c${i}`,
		firstName: 'F'.repeat(160),
		lastName: `Child-${i}` + 'Z'.repeat(140),
		birthDate: '2020-01-01',
	}));
	input.items = input.items.map((i) => ({
		...i,
		childKeys: input.children.map((c) => c.key),
	}));
	return input;
}
export function supportRow(id: string, createdAt: string) {
	const reference = crypto.randomUUID();
	return {
		sql: `INSERT INTO telegram_outbox
		 (id, source_kind, source_id, template_or_category, destination_ref, locale, payload_json,
		 dedupe_key, not_before, status, attempts, max_attempts, created_at, updated_at)
		 VALUES (?, 'support_thread', ?, 'bureau.support', 'bureau', 'de', ?, ?, ?, 'pending', 0, 5, ?, ?)`,
		params: [
			id,
			reference,
			JSON.stringify({
				category: 'technical',
				reference,
				receivedAt: createdAt,
				adminPath: `/admin/messages/${reference}`,
			}),
			`dedupe:${id}`,
			createdAt,
			createdAt,
			createdAt,
		],
	};
}
export function config() {
	return loadRuntimeConfig({
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
		TELEGRAM_PROVIDER: 'fake',
		TELEGRAM_CHAT_ID: 'synthetic-bureau',
		SCHEDULED_JOBS_ENABLED: 'true',
	});
}
export async function token(id: string) {
	return verificationToken(SECRET, (await service.get(id))!);
}
export async function verified(input = data()) {
	const receipt = await service.create(input, async () => lessons, NOW);
	await service.verify(await token(receipt.id), NOW);
	return receipt;
}
export async function seedAdmin() {
	await db.run({
		sql: `INSERT INTO users(id,email,email_normalized,password_hash,email_verified_at,role,first_name,last_name,first_name_normalized,last_name_normalized,privacy_notice_version,privacy_accepted_at,created_at,updated_at)
	 VALUES (?, 'admin@example.test','admin@example.test','synthetic-hash',?,'admin','Synthetic','Admin','synthetic','admin','test',?,?,?)`,
		params: [actor.id, NOW, NOW, NOW, NOW],
	});
}
export function useIntakeD1() {
	beforeEach(async () => {
		ctx = await createMigratedTestD1();
		db = new DatabaseBoundary(ctx.db);
		service = new IntakeService(db, SECRET, schedule);
	});
	afterEach(async () => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		await ctx.dispose();
	});
}
