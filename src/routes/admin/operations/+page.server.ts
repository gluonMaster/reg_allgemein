import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { translate } from '$lib/i18n';
import { verifiedAdminForm } from '$lib/server/admin/http';
import { loadRuntimeConfig } from '$lib/server/config/runtime';
import { DatabaseBoundary } from '$lib/server/db/database';
import {
	OperationsRepository,
	scheduledJobNames,
	type ScheduledJobName,
} from '$lib/server/operations/operations-repository';
import { runScheduledJobs } from '$lib/server/operations/scheduler';
import { requireAdmin } from '$lib/server/security/authorization';

const jobSet = new Set<string>(scheduledJobNames);

export const load: PageServerLoad = async (event) => {
	requireAdmin(event.locals.user);
	const config = loadRuntimeConfig(event.platform?.env);
	const repository = new OperationsRepository(new DatabaseBoundary(config.db));
	const [cadences, runs] = await Promise.all([
		repository.listScheduledCadences(),
		repository.listRecentRuns(),
	]);
	return {
		jobs: scheduledJobNames,
		commandKey: crypto.randomUUID(),
		cadences: cadences.map((cadence) => ({
			...cadence,
			safeResult: JSON.parse(cadence.safe_result_json) as Record<string, unknown>,
			safe_result_json: undefined,
			recent_failure_timestamps_json: undefined,
		})),
		runs: runs.map((run) => ({
			...run,
			safeResult: JSON.parse(run.safe_result_json) as Record<string, unknown>,
			safe_result_json: undefined,
		})),
	};
};

export const actions = {
	run: async (event) => {
		try {
			const { form, actor } = await verifiedAdminForm(event);
			const jobName = form.get('jobName')?.toString() ?? '';
			const commandKey = form.get('idempotencyKey')?.toString().trim() ?? '';
			if (
				!jobSet.has(jobName) ||
				!commandKey ||
				commandKey.length > 200 ||
				form.get('confirmation') !== 'confirmed'
			) {
				throw new Error('INVALID_MANUAL_JOB');
			}
			const [result] = await runScheduledJobs(loadRuntimeConfig(event.platform?.env), {
				triggerKind: 'manual',
				dedupeKey: commandKey,
				jobNames: [jobName as ScheduledJobName],
				admin: { id: actor.id, requestId: event.locals.requestId },
			});
			if (!result || result.status === 'failed') throw new Error('MANUAL_JOB_FAILED');
			return { success: true, message: translate('de', 'admin.operations.completed') };
		} catch {
			return fail(409, {
				success: false,
				message: translate('de', 'admin.operations.failed'),
			});
		}
	},
} satisfies Actions;
