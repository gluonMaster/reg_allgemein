import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	assertRemoteAcademicPeriodResult,
	assertRemoteAcademicPeriodReconciliationResult,
	buildRemoteAcademicPeriodReconciliationStatements,
	buildRemoteAcademicPeriodStatements,
	executeRemoteAcademicPeriodApply,
	validateRemoteAcademicPeriodInput,
	type RemoteAcademicPeriodInput,
} from '../../scripts/academic-period-remote';
import { createMigratedTestD1, type TestD1Context } from '../helpers/d1';

const baseInput: RemoteAcademicPeriodInput = {
	target: {
		environment: 'preview',
		databaseId: '22222222-2222-4222-8222-222222222222',
	},
	academicPeriod: '2026-2027',
	displayName: '2026/2027',
	startsOn: '2026-08-01',
	endsOn: '2027-07-31',
	isCurrent: true,
	operatorId: 'data-owner-preview',
	createdAt: '2026-08-24T15:00:00.000Z',
	gitCommitSha: 'a'.repeat(40),
};

describe('remote academic-period D1 statement contract', () => {
	let context: TestD1Context;
	let db: DatabaseBoundary;

	beforeEach(async () => {
		context = await createMigratedTestD1();
		db = new DatabaseBoundary(context.db);
	});

	afterEach(async () => {
		if (context) await context.dispose();
	});

	it('creates one current period and one append-only audit event idempotently', async () => {
		const statements = buildRemoteAcademicPeriodStatements(baseInput);
		const first = await db.batch(statements);
		expect(() => assertRemoteAcademicPeriodResult(first, statements.length)).not.toThrow();
		const second = await db.batch(statements);
		expect(() => assertRemoteAcademicPeriodResult(second, statements.length)).not.toThrow();

		const counts = await context.db
			.prepare(
				`SELECT
				(SELECT COUNT(*) FROM academic_periods) AS periods,
				(SELECT COUNT(*) FROM audit_events
					WHERE action = 'academic_period.remote_provisioned') AS audits`
			)
			.first<{ periods: number; audits: number }>();
		expect(counts).toEqual({ periods: 1, audits: 1 });
	});

	it('fails closed without changing an existing conflicting code', async () => {
		const initial = buildRemoteAcademicPeriodStatements(baseInput);
		await db.batch(initial);
		const conflicting = buildRemoteAcademicPeriodStatements({
			...baseInput,
			displayName: 'Conflicting display name',
			createdAt: '2026-08-24T15:01:00.000Z',
		});
		const result = await db.batch(conflicting);
		expect(() => assertRemoteAcademicPeriodResult(result, conflicting.length)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED'
		);
		const period = await context.db
			.prepare('SELECT display_name FROM academic_periods WHERE code = ?')
			.bind(baseInput.academicPeriod)
			.first<{ display_name: string }>();
		expect(period?.display_name).toBe(baseInput.displayName);
		const audits = await context.db
			.prepare(
				"SELECT COUNT(*) AS count FROM audit_events WHERE action = 'academic_period.remote_provisioned'"
			)
			.first<{ count: number }>();
		expect(audits?.count).toBe(1);
	});

	it('does not replace a different current period', async () => {
		await db.batch(buildRemoteAcademicPeriodStatements(baseInput));
		const next = buildRemoteAcademicPeriodStatements({
			...baseInput,
			academicPeriod: '2027-2028',
			displayName: '2027/2028',
			startsOn: '2027-08-01',
			endsOn: '2028-07-31',
			createdAt: '2026-08-24T15:02:00.000Z',
		});
		const result = await db.batch(next);
		expect(() => assertRemoteAcademicPeriodResult(result, next.length)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED'
		);
		const periods = await context.db
			.prepare('SELECT code FROM academic_periods ORDER BY code')
			.all<{ code: string }>();
		expect(periods.results).toEqual([{ code: baseInput.academicPeriod }]);
	});

	it('leaves no partial period or audit state when the deterministic audit ID is occupied', async () => {
		const validated = validateRemoteAcademicPeriodInput(baseInput);
		await context.db
			.prepare(
				`INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, ip_retention_value, created_at)
				 VALUES (?, NULL, 'system', 'synthetic.preoccupied', 'synthetic', ?, ?, '{}', NULL, ?)`
			)
			.bind(
				validated.auditEventId,
				validated.periodId,
				'synthetic-preoccupied-request',
				validated.createdAt
			)
			.run();

		const statements = buildRemoteAcademicPeriodStatements(baseInput);
		const result = await db.batch(statements);
		expect(() => assertRemoteAcademicPeriodResult(result, statements.length)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED'
		);
		const state = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM academic_periods WHERE id = ?) AS periods,
					(SELECT COUNT(*) FROM audit_events WHERE id = ?
						AND action = 'synthetic.preoccupied'
						AND request_id = 'synthetic-preoccupied-request') AS untouched_audits`
			)
			.bind(validated.periodId, validated.auditEventId)
			.first<{ periods: number; untouched_audits: number }>();
		expect(state).toEqual({ periods: 0, untouched_audits: 1 });
		const reconciliation = buildRemoteAcademicPeriodReconciliationStatements(baseInput);
		const reconciled = await db.batch(reconciliation);
		expect(
			assertRemoteAcademicPeriodReconciliationResult(reconciled, reconciliation.length)
		).toBe('conflict');
	});

	it('rolls the audit back when a later statement in the D1 batch fails', async () => {
		const statements = buildRemoteAcademicPeriodStatements(baseInput);
		statements[1] = {
			sql: `INSERT INTO academic_periods
				(id, code, display_name, starts_on, ends_on, is_current, created_at)
			 VALUES (NULL, ?, ?, ?, ?, 1, ?)`,
			params: [
				baseInput.academicPeriod,
				baseInput.displayName,
				baseInput.startsOn,
				baseInput.endsOn,
				baseInput.createdAt,
			],
		};
		await expect(db.batch(statements)).rejects.toThrow();
		const state = await context.db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM academic_periods) AS periods,
					(SELECT COUNT(*) FROM audit_events
						WHERE action = 'academic_period.remote_provisioned') AS audits`
			)
			.first<{ periods: number; audits: number }>();
		expect(state).toEqual({ periods: 0, audits: 0 });
	});

	it('reconciles timeout before commit as not_applied and timeout after commit as applied', async () => {
		const statements = buildRemoteAcademicPeriodStatements(baseInput);
		await expect(
			executeRemoteAcademicPeriodApply(statements.length, async () => {
				throw new Error('synthetic timeout before dispatch completion');
			})
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		const reconciliation = buildRemoteAcademicPeriodReconciliationStatements(baseInput);
		const before = await db.batch(reconciliation);
		expect(assertRemoteAcademicPeriodReconciliationResult(before, reconciliation.length)).toBe(
			'not_applied'
		);

		await expect(
			executeRemoteAcademicPeriodApply(statements.length, async () => {
				await db.batch(statements);
				throw new Error('synthetic timeout after commit');
			})
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		const after = await db.batch(reconciliation);
		expect(assertRemoteAcademicPeriodReconciliationResult(after, reconciliation.length)).toBe(
			'applied'
		);
	});

	it('reconciles malformed output after commit as applied without replaying the write', async () => {
		const statements = buildRemoteAcademicPeriodStatements(baseInput);
		let writeDispatches = 0;
		await expect(
			executeRemoteAcademicPeriodApply(statements.length, async () => {
				writeDispatches += 1;
				await db.batch(statements);
				return '{"truncated":';
			})
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		const reconciliation = buildRemoteAcademicPeriodReconciliationStatements(baseInput);
		const result = await db.batch(reconciliation);
		expect(assertRemoteAcademicPeriodReconciliationResult(result, reconciliation.length)).toBe(
			'applied'
		);
		expect(writeDispatches).toBe(1);
	});
});
