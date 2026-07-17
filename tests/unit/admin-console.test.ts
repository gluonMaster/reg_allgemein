import { describe, expect, it } from 'vitest';
import {
	blockUserSchema,
	catalogCourseDecisionSchema,
	childCorrectionDecisionSchema,
	familyCorrectionApplySchema,
	familyCorrectionPreviewSchema,
	trialTransitionSchema,
} from '../../src/lib/server/admin/contracts';
import {
	buildAdminNavigation,
	coreAdminNavigation,
	trialAdminNavigation,
} from '../../src/lib/server/admin/navigation';

const confirmedCommand = {
	reason: 'Geprüfte Verwaltungsentscheidung',
	confirmation: 'confirmed',
	idempotencyKey: 'admin-command-0001',
} as const;

describe('stage 06A admin contracts', () => {
	it('accepts only typed decisions with explicit confirmation', () => {
		expect(
			childCorrectionDecisionSchema.safeParse({
				...confirmedCommand,
				taskId: 'task-1',
				correctionId: 'correction-1',
				decision: 'approve',
			}).success
		).toBe(true);
		expect(
			childCorrectionDecisionSchema.safeParse({
				...confirmedCommand,
				taskId: 'task-1',
				correctionId: 'correction-1',
				decision: 'resolved',
			}).success
		).toBe(false);
		expect(
			catalogCourseDecisionSchema.safeParse({
				...confirmedCommand,
				courseGroupId: 'course-1',
				action: 'manual_override',
			}).success
		).toBe(false);
	});

	it('requires server-selected FamilyID destinations and high-friction apply evidence', () => {
		expect(
			familyCorrectionPreviewSchema.safeParse({
				userId: 'user-1',
				destinationKind: 'legacy_existing',
			}).success
		).toBe(false);
		expect(
			familyCorrectionPreviewSchema.safeParse({
				userId: 'user-1',
				destinationKind: 'portal_allocated',
				destinationAllocationId: 'forged-free-form-id',
			}).success
		).toBe(false);
		expect(
			familyCorrectionApplySchema.safeParse({
				previewId: 'preview-1',
				reason: 'Geprüfte Berichtigung',
				idempotencyKey: 'family-command-0001',
			}).success
		).toBe(false);
	});

	it('requires a typed, confirmed and idempotent block command', () => {
		expect(
			blockUserSchema.safeParse({
				...confirmedCommand,
				userId: 'user-1',
				blocked: 'true',
			}).success
		).toBe(true);
		expect(
			blockUserSchema.safeParse({
				...confirmedCommand,
				confirmation: 'yes',
				userId: 'user-1',
				blocked: 'true',
			}).success
		).toBe(false);
	});

	it('requires an explicit future-date payload shape for trial confirmation', () => {
		expect(
			trialTransitionSchema.safeParse({
				...confirmedCommand,
				trialId: 'trial-1',
				action: 'confirm',
				sessionId: 'session-1',
				confirmedDate: '2026-07-20',
			}).success
		).toBe(true);
		expect(
			trialTransitionSchema.safeParse({
				...confirmedCommand,
				trialId: 'trial-1',
				action: 'confirm',
			}).success
		).toBe(false);
		expect(
			trialTransitionSchema.safeParse({
				...confirmedCommand,
				trialId: 'trial-1',
				action: 'generic_status',
			}).success
		).toBe(false);
	});
});

describe('stage 06A admin navigation', () => {
	it('keeps one ordered shell and exposes extension points for later stages', () => {
		const navigation = buildAdminNavigation([
			{
				id: 'documents',
				href: '/admin/documents',
				labelKey: 'admin.nav.reviews',
				order: 35,
			},
		]);

		expect(navigation).toHaveLength(coreAdminNavigation.length + 1);
		expect(navigation.map((item) => item.id)).toContain('documents');
		expect(navigation.map((item) => item.order)).toEqual(
			[...navigation].map((item) => item.order).sort((left, right) => left - right)
		);
	});

	it('adds stage 07 trials through the shared navigation extension point', () => {
		const navigation = buildAdminNavigation(trialAdminNavigation);
		expect(navigation).toHaveLength(coreAdminNavigation.length + 1);
		expect(navigation.find((item) => item.id === 'trials')).toMatchObject({
			href: '/admin/trials',
		});
	});
});
