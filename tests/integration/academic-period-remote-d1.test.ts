import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	assertRemoteAcademicPeriodResult,
	buildRemoteAcademicPeriodStatements,
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
});
