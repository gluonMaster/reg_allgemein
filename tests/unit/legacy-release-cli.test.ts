import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	assertGitCommitMatchesHead,
	assertIndependentRecoveryVerifier,
	assertLegacyProductionTransitionBoundary,
	assertLegacyReleaseVerification,
	currentGitCommitSha,
	parseLegacyReleaseArguments,
	promotionConfirmationBindingDigest,
	writeProtectedArtifact,
} from '../../scripts/import-legacy-release';
import type { LegacyReleaseVerification } from '$lib/server/import/import-repository';

function validVerification(): LegacyReleaseVerification {
	return {
		planId: '11111111-1111-4111-8111-111111111111',
		status: 'promoted',
		currentPair: 'target',
		currentPairUnique: true,
		dependencyCompatible: true,
		foreignKeyIntegrity: true,
		runStatus: { plusBText: 'promoted', access: 'promoted' },
		expected: {
			plusBText: { rowsTotal: 2, rowsStaged: 2, rowsSkipped: 0, oldGroups: 1, targets: 1 },
			access: {
				rowsTotal: 1,
				rowsStaged: 1,
				rowsSkipped: 0,
				sourceRows: 1,
				families: 1,
				emails: 1,
				children: 1,
				enrollments: 1,
				projectedFamilies: 1,
				projectedEmails: 1,
				projectedChildren: 1,
				projectedEnrollments: 1,
			},
			issues: { info: 0, warning: 0, error: 0, fatal: 0 },
		},
		runRows: {
			plusBText: { total: 2, staged: 2, promoted: 2, skipped: 0 },
			access: { total: 1, staged: 1, promoted: 1, skipped: 0 },
		},
		targetRows: {
			plusBTextOldGroups: 1,
			plusBTextTargets: 1,
			accessSourceRows: 1,
			accessFamilies: 1,
			accessEmails: 1,
			accessChildren: 1,
			accessEnrollments: 1,
		},
		projectionRows: {
			accessSourceRows: 1,
			accessFamilies: 1,
			accessEmails: 1,
			accessChildren: 1,
			accessEnrollments: 1,
		},
		issues: { info: 0, warning: 0, error: 0, fatal: 0 },
		events: { promote: 1, rollback: 0, rollForward: 0 },
	};
}

describe('legacy release remote command boundary', () => {
	it.each([
		'plan',
		'stage',
		'review',
		'recovery-evidence',
		'confirmation',
		'promote',
		'verify',
		'rollback',
		'roll-forward',
	] as const)(
		'requires explicit remote intent for %s',
		(command) => {
			expect(() => parseLegacyReleaseArguments([command])).toThrow(
				'CLI_REMOTE_CONFIRMATION_REQUIRED'
			);
			expect(parseLegacyReleaseArguments([command, '--remote'])).toMatchObject({ command });
		}
	);

	it('rejects unknown, duplicate and valued flags before any target access', () => {
		expect(() => parseLegacyReleaseArguments(['verify', '--remote', '--unknown'])).toThrow(
			'CLI_ARGUMENT_UNKNOWN'
		);
		expect(() => parseLegacyReleaseArguments(['verify', '--remote', '--remote'])).toThrow(
			'CLI_ARGUMENT_DUPLICATE'
		);
		expect(() => parseLegacyReleaseArguments(['verify', '--remote', 'yes'])).toThrow(
			'CLI_FLAG_VALUE_FORBIDDEN'
		);
	});

	it('keeps mutating arguments command-specific', () => {
		expect(() =>
			parseLegacyReleaseArguments(['promote', '--remote', '--staged-digest', 'a'.repeat(64)])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(
			parseLegacyReleaseArguments([
				'confirmation',
				'--remote',
				'--action',
				'promote',
				'--plan',
				'imports/plan.json',
			]).options.get('action')
		).toBe('promote');
		expect(
			parseLegacyReleaseArguments([
				'plan',
				'--remote',
				'--synthetic-variant',
				'baseline',
			]).options.get('synthetic-variant')
		).toBe('baseline');
		expect(
			parseLegacyReleaseArguments([
				'stage',
				'--remote',
				'--synthetic-variant',
				'candidate',
			]).options.get('synthetic-variant')
		).toBe('candidate');
		expect(() =>
			parseLegacyReleaseArguments([
				'promote',
				'--remote',
				'--synthetic-variant',
				'candidate',
			])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(
			parseLegacyReleaseArguments([
				'promote',
				'--remote',
				'--review-digest',
				'a'.repeat(64),
			]).options.get('review-digest')
		).toBe('a'.repeat(64));
		expect(() =>
			parseLegacyReleaseArguments([
				'rollback',
				'--remote',
				'--recovery-evidence-digest',
				'b'.repeat(64),
			])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(() =>
			parseLegacyReleaseArguments([
				'promote',
				'--remote',
				'--recovery-evidence-digest',
				'b'.repeat(64),
			])
		).toThrow('CLI_ARGUMENT_UNKNOWN');
		expect(
			parseLegacyReleaseArguments([
				'promote',
				'--remote',
				'--recovery-evidence',
				'imports/recovery.json',
			]).options.get('recovery-evidence')
		).toBe('imports/recovery.json');
	});

	it('requires a recovery verifier independent from every release role', () => {
		const roles = {
			plannedBy: 'operator.planner',
			stagedBy: 'operator.stager',
			reviewedBy: 'operator.reviewer',
			promoterId: 'operator.promoter',
		};
		expect(
			assertIndependentRecoveryVerifier({
				...roles,
				verifiedBy: 'operator.recovery',
			})
		).toBe('operator.recovery');
		for (const verifiedBy of Object.values(roles)) {
			expect(() =>
				assertIndependentRecoveryVerifier({ ...roles, verifiedBy })
			).toThrow('LEGACY_RECOVERY_EVIDENCE_OPERATOR_NOT_INDEPENDENT');
		}
	});

	it('hard-disables production transitions before any remote boundary is needed', () => {
		for (const command of ['promote', 'rollback', 'roll-forward'] as const) {
			expect(() =>
				assertLegacyProductionTransitionBoundary('production', command)
			).toThrow('LEGACY_RELEASE_PRODUCTION_TRANSACTION_EVIDENCE_NOT_IMPLEMENTED');
			expect(() =>
				assertLegacyProductionTransitionBoundary('preview', command)
			).not.toThrow();
		}
		expect(() =>
			assertLegacyProductionTransitionBoundary('production', 'confirmation')
		).not.toThrow();
	});

	it('requires and hashes exact review plus recovery evidence for promote', async () => {
		await expect(
			promotionConfirmationBindingDigest(
				new Map([
					['review-digest', 'a'.repeat(64)],
					['operator-id', 'operator.promoter'],
				])
			)
		).rejects.toThrow('CLI_RECOVERY_EVIDENCE_DIGEST_REQUIRED');
		await expect(
			promotionConfirmationBindingDigest(
				new Map([
					['review-digest', 'a'.repeat(64)],
					['recovery-evidence-digest', 'not-a-digest'],
					['operator-id', 'operator.promoter'],
				])
			)
		).rejects.toThrow('CLI_RECOVERY_EVIDENCE_DIGEST_INVALID');
		await expect(
			promotionConfirmationBindingDigest(
				new Map([
					['review-digest', 'a'.repeat(64)],
					['recovery-evidence-digest', 'b'.repeat(64)],
					['operator-id', 'operator.promoter'],
				])
			)
		).resolves.toMatchObject({
			reviewDigestSha256: 'a'.repeat(64),
			recoveryEvidenceDigestSha256: 'b'.repeat(64),
			operatorId: 'operator.promoter',
			bindingDigestSha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
		});
	});

	it('creates protected artifacts once, permits byte-identical replay and rejects conflicts', async () => {
		const path = join(tmpdir(), `legacy-release-${randomUUID()}.json`);
		try {
			await writeProtectedArtifact(path, { schemaVersion: 1, marker: 'first' });
			const original = await readFile(path, 'utf8');
			await expect(
				writeProtectedArtifact(path, { schemaVersion: 1, marker: 'first' })
			).resolves.toBeUndefined();
			await expect(
				writeProtectedArtifact(path, { schemaVersion: 1, marker: 'different' })
			).rejects.toThrow('CLI_PROTECTED_ARTIFACT_CONFLICT');
			await expect(readFile(path, 'utf8')).resolves.toBe(original);
		} finally {
			await rm(path, { force: true });
		}
	});

	it('binds --git-commit to the exact locally derived HEAD', () => {
		const head = currentGitCommitSha();
		expect(head).toMatch(/^[0-9a-f]{40,64}$/u);
		expect(assertGitCommitMatchesHead(head.toUpperCase(), head)).toBe(head);
		expect(() => assertGitCommitMatchesHead('f'.repeat(head.length), head)).toThrow(
			'CLI_GIT_COMMIT_HEAD_MISMATCH'
		);
		expect(() => assertGitCommitMatchesHead('HEAD', head)).toThrow('CLI_GIT_COMMIT_INVALID');
	});

	it.each([
		{ name: 'unexpected current pair', patch: { currentPair: 'unexpected' } },
		{ name: 'duplicate current pair', patch: { currentPairUnique: false } },
		{ name: 'dependency drift', patch: { dependencyCompatible: false } },
		{ name: 'foreign key violation', patch: { foreignKeyIntegrity: false } },
		{
			name: 'fatal import issue',
			patch: { issues: { info: 0, warning: 0, error: 0, fatal: 1 } },
		},
		{
			name: 'invalid run status',
			patch: { runStatus: { plusBText: 'validated', access: 'promoted' } },
		},
		{
			name: 'missing promote event',
			patch: { events: { promote: 0, rollback: 0, rollForward: 0 } },
		},
	] as const)('fails verification closed for $name', ({ patch }) => {
		const verification = { ...validVerification(), ...patch } as LegacyReleaseVerification;
		expect(() => assertLegacyReleaseVerification(verification)).toThrow(
			'Import storage operation failed.'
		);
		try {
			assertLegacyReleaseVerification(verification);
		} catch (error) {
			expect(error).toMatchObject({ code: 'LEGACY_RELEASE_VERIFY_FAILED' });
		}
	});

	it('accepts only lifecycle-consistent verify states and event sequences', () => {
		const promoted = validVerification();
		expect(assertLegacyReleaseVerification(promoted)).toBe(promoted);
		expect(
			assertLegacyReleaseVerification({
				...promoted,
				status: 'reviewed',
				currentPair: 'previous',
				runStatus: { plusBText: 'validated', access: 'validated' },
				runRows: {
					plusBText: { total: 2, staged: 2, promoted: 0, skipped: 0 },
					access: { total: 1, staged: 1, promoted: 0, skipped: 0 },
				},
				projectionRows: {
					accessSourceRows: 0,
					accessFamilies: 0,
					accessEmails: 0,
					accessChildren: 0,
					accessEnrollments: 0,
				},
				events: { promote: 0, rollback: 0, rollForward: 0 },
			})
		).toBeTruthy();
		expect(
			assertLegacyReleaseVerification({
				...promoted,
				status: 'rolled_back',
				currentPair: 'previous',
				projectionRows: {
					accessSourceRows: 0,
					accessFamilies: 0,
					accessEmails: 0,
					accessChildren: 0,
					accessEnrollments: 0,
				},
				events: { promote: 1, rollback: 2, rollForward: 1 },
			})
		).toBeTruthy();
		expect(
			assertLegacyReleaseVerification({
				...promoted,
				events: { promote: 1, rollback: 2, rollForward: 2 },
			})
		).toBeTruthy();
	});
});
