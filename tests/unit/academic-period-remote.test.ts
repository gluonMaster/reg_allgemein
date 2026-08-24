import { describe, expect, it } from 'vitest';
import {
	assertRemoteAcademicPeriodResult,
	assertRemoteAcademicPeriodReconciliationResult,
	buildRemoteAcademicPeriodReconciliationStatements,
	buildRemoteAcademicPeriodStatements,
	executeRemoteAcademicPeriodApply,
	executeRemoteAcademicPeriodReconciliation,
	expectedRemoteAcademicPeriodConfirmation,
	parseRemoteAcademicPeriodArguments,
	remoteAcademicPeriodInputFromOptions,
	valueFreeRemoteAcademicPeriodConfigSummary,
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

function stateResult(outcome: 'applied' | 'not_applied' | 'conflict', statementCount = 3) {
	const applied = outcome === 'applied' ? 1 : 0;
	const conflict = outcome === 'conflict' ? 1 : 0;
	return [
		...Array.from({ length: statementCount - 1 }, () => ({ success: true, results: [] })),
		{
			success: true,
			results: [
				{
					outcome,
					period_id_count: applied || conflict,
					period_code_count: applied,
					current_period_count: applied,
					exact_period_count: applied,
					audit_id_count: applied,
					audit_request_count: applied,
					exact_audit_count: applied,
				},
			],
		},
	];
}

describe('exact-target remote academic-period provisioning', () => {
	it('keeps confirmation local and requires explicit remote on apply and reconcile', () => {
		expect(parseRemoteAcademicPeriodArguments(['confirmation', '--current'])).toMatchObject({
			action: 'confirmation',
		});
		expect(() => parseRemoteAcademicPeriodArguments(['confirmation', '--remote'])).toThrow(
			'CLI_REMOTE_FORBIDDEN'
		);
		expect(() => parseRemoteAcademicPeriodArguments(['apply', '--current'])).toThrow(
			'CLI_REMOTE_CONFIRMATION_REQUIRED'
		);
		expect(parseRemoteAcademicPeriodArguments(['reconcile', '--remote'])).toMatchObject({
			action: 'reconcile',
		});
		expect(() => parseRemoteAcademicPeriodArguments(['reconcile', '--current'])).toThrow(
			'CLI_REMOTE_CONFIRMATION_REQUIRED'
		);
		expect(() =>
			parseRemoteAcademicPeriodArguments(['apply', '--remote', '--unknown'])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(() => parseRemoteAcademicPeriodArguments(['apply', '--remote', '--remote'])).toThrow(
			'CLI_ARGUMENT_DUPLICATE'
		);
	});

	it('fails closed on a missing or invalid account and returns only value-free config evidence', () => {
		const exactConfig = {
			account_id: 'a'.repeat(32),
			vars: { APP_ENV: 'preview' },
			d1_databases: [{ binding: 'DB', database_id: input.target.databaseId }],
		};
		expect(() =>
			valueFreeRemoteAcademicPeriodConfigSummary(
				{ ...exactConfig, account_id: undefined },
				'preview',
				input.target.databaseId
			)
		).toThrow('CLI_ACCOUNT_ID_INVALID');
		expect(() =>
			valueFreeRemoteAcademicPeriodConfigSummary(
				{ ...exactConfig, account_id: 'invalid' },
				'preview',
				input.target.databaseId
			)
		).toThrow('CLI_ACCOUNT_ID_INVALID');
		const summary = valueFreeRemoteAcademicPeriodConfigSummary(
			exactConfig,
			'preview',
			input.target.databaseId
		);
		expect(summary).toEqual({
			status: 'ready',
			environment: 'preview',
			accountIdValid: true,
			databaseIdValid: true,
			databaseBindingCount: 1,
			databaseBinding: 'DB',
			selectorFree: true,
		});
		expect(JSON.stringify(summary)).not.toContain(exactConfig.account_id);
		expect(JSON.stringify(summary)).not.toContain(input.target.databaseId);
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

	it('builds reconciliation as one SELECT-only statement with the exact operation binding', () => {
		const statements = buildRemoteAcademicPeriodReconciliationStatements(input);
		expect(statements).toHaveLength(1);
		expect(statements[0].sql.trimStart()).toMatch(/^SELECT\b/u);
		expect(statements[0].sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b/iu);
		expect(renderD1BatchSql(statements)).toContain('2026-2027');
	});

	it('accepts only an internally consistent terminal applied assertion', () => {
		const valid = stateResult('applied');
		expect(() => assertRemoteAcademicPeriodResult(valid, 3)).not.toThrow();
		expect(() => assertRemoteAcademicPeriodResult(valid, 2)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_RESULT_INVALID'
		);
		expect(() => assertRemoteAcademicPeriodResult(stateResult('conflict'), 3)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED'
		);
		const inconsistent = stateResult('applied');
		inconsistent[2].results[0].audit_id_count = 0;
		expect(() => assertRemoteAcademicPeriodResult(inconsistent, 3)).toThrow(
			'ACADEMIC_PERIOD_REMOTE_RESULT_INVALID'
		);
	});

	it('classifies reconciliation as applied, not_applied, or conflict', () => {
		for (const outcome of ['applied', 'not_applied', 'conflict'] as const) {
			expect(assertRemoteAcademicPeriodReconciliationResult(stateResult(outcome, 1), 1)).toBe(
				outcome
			);
		}
	});

	it('treats every post-dispatch transport or result-shape uncertainty as ambiguous', async () => {
		await expect(
			executeRemoteAcademicPeriodApply(3, async () => JSON.stringify(stateResult('applied')))
		).resolves.toBeUndefined();
		await expect(
			executeRemoteAcademicPeriodApply(3, async () => Promise.reject(new Error('timeout')))
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		await expect(
			executeRemoteAcademicPeriodApply(3, async () => '{"truncated":')
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		await expect(
			executeRemoteAcademicPeriodApply(3, async () => JSON.stringify([{ success: true }]))
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_EXECUTION_AMBIGUOUS');
		await expect(
			executeRemoteAcademicPeriodApply(3, async () => JSON.stringify(stateResult('conflict')))
		).rejects.toThrow('ACADEMIC_PERIOD_REMOTE_ASSERTION_FAILED');
	});

	it('parses a valid SELECT-only reconciliation response without mutating or retrying', async () => {
		let dispatches = 0;
		await expect(
			executeRemoteAcademicPeriodReconciliation(1, async () => {
				dispatches += 1;
				return JSON.stringify(stateResult('not_applied', 1));
			})
		).resolves.toBe('not_applied');
		expect(dispatches).toBe(1);
	});
});
