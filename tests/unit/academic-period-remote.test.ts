import { describe, expect, it } from 'vitest';
import {
	assertRemoteAcademicPeriodResult,
	buildRemoteAcademicPeriodStatements,
	expectedRemoteAcademicPeriodConfirmation,
	parseRemoteAcademicPeriodArguments,
	remoteAcademicPeriodInputFromOptions,
	validateRemoteAcademicPeriodInput,
	type RemoteAcademicPeriodInput,
} from '../../scripts/academic-period-remote';
import { buildPinnedWranglerConfig, renderD1BatchSql } from '../../scripts/admin-bootstrap-remote';

const input: RemoteAcademicPeriodInput = {
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

describe('exact-target remote academic-period provisioning', () => {
	it('keeps confirmation local and requires explicit remote on apply', () => {
		expect(parseRemoteAcademicPeriodArguments(['confirmation', '--current'])).toMatchObject({
			action: 'confirmation',
		});
		expect(() => parseRemoteAcademicPeriodArguments(['confirmation', '--remote'])).toThrow(
			'CLI_REMOTE_FORBIDDEN'
		);
		expect(() => parseRemoteAcademicPeriodArguments(['apply', '--current'])).toThrow(
			'CLI_REMOTE_CONFIRMATION_REQUIRED'
		);
		expect(() =>
			parseRemoteAcademicPeriodArguments(['apply', '--remote', '--unknown'])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(() => parseRemoteAcademicPeriodArguments(['apply', '--remote', '--remote'])).toThrow(
			'CLI_ARGUMENT_DUPLICATE'
		);
	});

	it('requires an explicit current flag before constructing the mutation input', () => {
		expect(() =>
			remoteAcademicPeriodInputFromOptions(
				new Map([
					['academic-period', input.academicPeriod],
					['display-name', input.displayName],
					['starts-on', input.startsOn],
					['ends-on', input.endsOn],
					['operator-id', input.operatorId],
					['created-at', input.createdAt],
					['git-commit', input.gitCommitSha],
				]),
				'preview',
				input.target.databaseId
			)
		).toThrow('ACADEMIC_PERIOD_CURRENT_REQUIRED');
	});

	it('builds deterministic IDs and a confirmation bound to every operation field', () => {
		const first = validateRemoteAcademicPeriodInput(input);
		const second = validateRemoteAcademicPeriodInput(input);
		expect(second).toEqual(first);
		expect(first.periodId).toMatch(/^[0-9a-f-]{36}$/u);
		expect(first.operationDigestSha256).toMatch(/^[0-9a-f]{64}$/u);
		const confirmation = expectedRemoteAcademicPeriodConfirmation(input);
		expect(confirmation).toContain(
			'PROVISION_ACADEMIC_PERIOD_PREVIEW_22222222-2222-4222-8222-222222222222_'
		);
		expect(
			expectedRemoteAcademicPeriodConfirmation({ ...input, endsOn: '2027-08-01' })
		).not.toBe(confirmation);
	});

	it('rejects invalid or ambiguous period values before SQL is built', () => {
		expect(() =>
			validateRemoteAcademicPeriodInput({ ...input, academicPeriod: '../2026' })
		).toThrow('ACADEMIC_PERIOD_CODE_INVALID');
		expect(() =>
			validateRemoteAcademicPeriodInput({ ...input, startsOn: '2026-02-30' })
		).toThrow('ACADEMIC_PERIOD_STARTS_ON_INVALID');
		expect(() =>
			validateRemoteAcademicPeriodInput({
				...input,
				startsOn: '2027-08-01',
				endsOn: '2026-07-31',
			})
		).toThrow('ACADEMIC_PERIOD_DATE_RANGE_INVALID');
		expect(() =>
			validateRemoteAcademicPeriodInput({ ...input, createdAt: '2026-08-24T15:00:00Z' })
		).toThrow('ACADEMIC_PERIOD_CREATED_AT_INVALID');
	});

	it('renders only escaped controlled SQL and strips config selectors for the child process', () => {
		const statements = buildRemoteAcademicPeriodStatements({
			...input,
			displayName: "School year's 2026/2027",
		});
		const sql = renderD1BatchSql(statements);
		expect(sql).not.toContain('?');
		expect(sql).toContain("School year''s 2026/2027");
		expect(sql).toContain('academic_period.remote_provisioned');
		expect(
			JSON.parse(
				buildPinnedWranglerConfig(
					{
						account_id: 'a'.repeat(32),
						vars: { APP_ENV: 'preview', SECRET: 'not-forwarded' },
						d1_databases: [{ binding: 'DB', database_id: input.target.databaseId }],
					},
					'kolibri-academic-period-exact-target'
				)
			)
		).toEqual({
			name: 'kolibri-academic-period-exact-target',
			send_metrics: false,
			d1_databases: [],
			account_id: 'a'.repeat(32),
		});
	});

	it('accepts only the terminal exact-period and audit assertion', () => {
		const valid = [
			{ success: true, results: [] },
			{ success: true, results: [] },
			{
				success: true,
				results: [
					{
						status: 'ready',
						period_count: 1,
						exact_period_count: 1,
						audit_count: 1,
					},
				],
			},
		];
		expect(() => assertRemoteAcademicPeriodResult(valid, 3)).not.toThrow();
		expect(() => assertRemoteAcademicPeriodResult(valid, 2)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_RESULT_INVALID'
		);
		expect(() =>
			assertRemoteAcademicPeriodResult(
				[
					...valid.slice(0, 2),
					{ ...valid[2], results: [{ ...valid[2].results[0], audit_count: 0 }] },
				],
				3
			)
		).toThrow('ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED');
	});
});
