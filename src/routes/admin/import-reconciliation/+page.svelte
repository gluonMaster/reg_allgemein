<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	import { translate } from '$lib/i18n';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const actionsByClass: Record<
		string,
		Array<{ action: string; reason: string; label: import('$lib/i18n').MessageKey }>
	> = {
		course_mapping: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
			{
				action: 'exact_catalog_mapping',
				reason: 'exact_mapping_confirmed',
				label: 'ui.reconciliation.confirmMapping',
			},
		],
		family_identity: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
			{
				action: 'typed_family_correction',
				reason: 'family_correction_verified',
				label: 'ui.reconciliation.verifyFamily',
			},
		],
		invalid_email: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
			{
				action: 'verified_portal_family_link',
				reason: 'portal_family_link_verified',
				label: 'ui.reconciliation.verifyPortal',
			},
		],
		invalid_birth_date: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
			{
				action: 'typed_child_correction',
				reason: 'child_correction_verified',
				label: 'ui.reconciliation.verifyChild',
			},
		],
		price: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
		],
		duration: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
		],
		duplicate_service: [
			{
				action: 'same_service_duplicate',
				reason: 'same_service_confirmed',
				label: 'ui.reconciliation.sameService',
			},
			{
				action: 'distinct_service_proven',
				reason: 'distinct_service_evidence_confirmed',
				label: 'ui.reconciliation.distinctService',
			},
		],
		source_consistency: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'ui.reconciliation.requestCorrection',
			},
		],
	};

	function entityLink(entityType: string, entityId: string | null): string | null {
		if (!entityId) return null;
		if (entityType === 'legacy_family') return `/admin/legacy/${entityId}`;
		return entityType === 'legacy_enrollment' ? '/admin/catalog' : null;
	}

	function exportHref(filters: PageData['filters']): string {
		const params = new URLSearchParams();
		for (const [name, value] of [
			['period', filters.periodId],
			['source', filters.sourceKind],
			['class', filters.issueClass],
			['state', filters.state],
			['assignee', filters.assigneeId],
			['firstRun', filters.firstSeenRunId],
			['lastRun', filters.lastSeenRunId],
		] as const) {
			if (value) params.set(name, value);
		}
		const query = params.toString();
		return `/admin/import-reconciliation/export.json${query ? `?${query}` : ''}`;
	}

	let selectedEntityLink = $derived(
		data.selected
			? entityLink(data.selected.item.entityType, data.selected.item.entityId)
			: null
	);
	let exportUrl = $derived(exportHref(data.filters));
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'ui.reconciliation.title')}</h2>
	<p>{translate(uiLocale, 'ui.reconciliation.notice')}</p>
	<p>
		<a href={exportUrl}
			>{translate(uiLocale, 'ui.reconciliation.export')}</a
		>
	</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<div class="admin-list">
		{#each data.queue.summary as item}
			<article class="admin-card">
				<strong>{translateAdminCode(uiLocale, item.issueClass)}</strong>
				<p>{translateAdminCode(uiLocale, item.state)}: {item.count} {translate(uiLocale, 'ui.reconciliation.blocking')} {item.blocking}</p>
			</article>
		{/each}
	</div>

	<form method="GET" class="admin-filter-form">
		<label>{translate(uiLocale, 'ui.reconciliation.period')} <input name="period" value={data.filters.periodId ?? ''} /></label>
		<label
			>{translate(uiLocale, 'ui.reconciliation.source')}
			<select name="source" value={data.filters.sourceKind ?? ''}>
				<option value="">{translate(uiLocale, 'ui.all')}</option><option value="access">Access</option><option
					value="plusbtext">PlusBText</option
				>
			</select>
		</label>
		<label>{translate(uiLocale, 'ui.reconciliation.class')} <input name="class" value={data.filters.issueClass ?? ''} /></label>
		<label>{translate(uiLocale, 'ui.status')} <input name="state" value={data.filters.state ?? ''} /></label>
		<label>{translate(uiLocale, 'ui.reconciliation.assignee')} <input name="assignee" value={data.filters.assigneeId ?? ''} /></label>
		<label>{translate(uiLocale, 'ui.reconciliation.firstRun')} <input name="firstRun" value={data.filters.firstSeenRunId ?? ''} /></label
		>
		<label>{translate(uiLocale, 'ui.reconciliation.lastRun')} <input name="lastRun" value={data.filters.lastSeenRunId ?? ''} /></label>
		<button type="submit">{translate(uiLocale, 'ui.filter')}</button>
	</form>

	{#if data.queue.summary.some((item) => item.blocking > 0)}
		<p class="form-status" role="alert">
			{translate(uiLocale, 'ui.reconciliation.blocked')}
		</p>
	{/if}

	<form method="POST" action="?/batch" class="admin-action-form">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input
			type="hidden"
			name="idempotencyKey"
			value={`${data.commandKey}:reconciliation:batch`}
		/>
		<div class="admin-list">
			{#each data.queue.items as item}
				<article class="admin-card">
					<label class="checkbox"
						><input
							type="checkbox"
							name="case"
							value={`${item.id}|${item.version}`}
						/><span>{translate(uiLocale, 'ui.reconciliation.batch')}</span></label
					>
					<h3><a href={`?case=${item.id}`}>{item.issueCode}</a></h3>
					<p>
						{item.periodCode} · {translateAdminCode(uiLocale, item.sourceKind)} · {translateAdminCode(uiLocale, item.issueClass)} · {translateAdminCode(uiLocale, item.state)} · v{item.version}
					</p>
					<p><code>{item.id}</code></p>
					<p>
						{translate(uiLocale, 'ui.reconciliation.first')} <code>{item.firstImportRunId}</code> {translate(uiLocale, 'ui.reconciliation.last')}
						<code>{item.lastSeenImportRunId}</code>
					</p>
				</article>
			{/each}
		</div>
		<label
			>{translate(uiLocale, 'ui.reconciliation.batchAction')}
			<select name="action">
				<option value="assign">{translate(uiLocale, 'ui.reconciliation.assign')}</option>
				<option value="unassign">{translate(uiLocale, 'ui.reconciliation.unassign')}</option>
				<option value="await_upstream">{translate(uiLocale, 'ui.reconciliation.awaitUpstream')}</option>
				<option value="mark_ready_to_verify">{translate(uiLocale, 'ui.reconciliation.ready')}</option>
			</select>
		</label>
		<label
			>{translate(uiLocale, 'ui.reconciliation.reasonCode')}
			<select name="reasonCode">
				<option value="operator_assignment">{translate(uiLocale, 'ui.reconciliation.assignmentReason')}</option>
				<option value="operator_unassignment">{translate(uiLocale, 'ui.reconciliation.unassignmentReason')}</option>
				<option value="upstream_correction_requested">{translate(uiLocale, 'ui.reconciliation.requestedReason')}</option>
				<option value="upstream_correction_reported">{translate(uiLocale, 'ui.reconciliation.reportedReason')}</option>
			</select>
		</label>
		<label>{translate(uiLocale, 'ui.reconciliation.assignee')} <input name="assigneeId" /></label>
		<label class="checkbox"
			><input type="checkbox" name="confirmation" value="confirmed" required /><span
				>{translate(uiLocale, 'ui.confirm')}</span
			></label
		>
		<button type="submit">{translate(uiLocale, 'ui.reconciliation.applyBatch')}</button>
	</form>

	{#if data.selected}
		<article class="admin-card">
			<h3>{translate(uiLocale, 'ui.reconciliation.case')} {data.selected.item.id}</h3>
			<p>
				{data.selected.item.issueCode} · {translateAdminCode(uiLocale, data.selected.item.issueClass)} · {translateAdminCode(uiLocale, data.selected.item.state)}
			</p>
			{#if selectedEntityLink}
				<a href={selectedEntityLink}>{translate(uiLocale, 'ui.reconciliation.openDetail')}</a>
			{/if}
			<form method="POST" action="?/mutate" class="admin-action-form">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="caseId" value={data.selected.item.id} />
				<input type="hidden" name="expectedVersion" value={data.selected.item.version} />
				<input
					type="hidden"
					name="idempotencyKey"
					value={`${data.commandKey}:reconciliation:${data.selected.item.id}`}
				/>
				<label
					>{translate(uiLocale, 'ui.action')}
					<select name="action">
						<option value="assign">{translate(uiLocale, 'ui.reconciliation.assign')}</option>
						<option value="unassign">{translate(uiLocale, 'ui.reconciliation.unassign')}</option>
						<option value="mark_ready_to_verify">{translate(uiLocale, 'ui.reconciliation.ready')}</option>
						{#each actionsByClass[data.selected.item.issueClass] ?? [] as option}
							<option value={option.action}>{translate(uiLocale, option.label)}</option>
						{/each}
					</select>
				</label>
				<label>{translate(uiLocale, 'ui.reconciliation.reasonCode')} <input name="reasonCode" required /></label>
				<label>{translate(uiLocale, 'ui.reconciliation.assignee')} <input name="assigneeId" /></label>
				<label
					>{translate(uiLocale, 'ui.reconciliation.evidenceType')}
					<select name="targetType"
						><option value=""></option><option value="course_group">{translate(uiLocale, 'ui.reconciliation.courseGroup')}</option
						><option value="legacy_family">{translate(uiLocale, 'ui.reconciliation.legacyFamily')}</option><option
							value="legacy_child">{translate(uiLocale, 'ui.reconciliation.legacyChild')}</option
						><option value="legacy_enrollment">{translate(uiLocale, 'ui.reconciliation.legacyEnrollment')}</option
						><option value="user">{translate(uiLocale, 'ui.reconciliation.user')}</option><option value="family_reassignment"
							>{translate(uiLocale, 'ui.reconciliation.familyReassignment')}</option
						></select
					>
				</label>
				<label>{translate(uiLocale, 'ui.reconciliation.evidenceId')} <input name="targetId" /></label>
				<label class="checkbox"
					><input type="checkbox" name="confirmation" value="confirmed" required /><span
						>{translate(uiLocale, 'ui.reconciliation.confirmEffect')}</span
					></label
				>
				<button type="submit">{translate(uiLocale, 'ui.apply')}</button>
			</form>
			<h4>{translate(uiLocale, 'ui.reconciliation.timeline')}</h4>
			<ul>
				{#each data.selected.timeline as entry}
					<li>
						{entry.createdAt} · {translateAdminCode(uiLocale, entry.action)} · {translateAdminCode(uiLocale, entry.reasonCode)} ·
						<code>{entry.id}</code>
					</li>
				{/each}
			</ul>
		</article>
	{/if}
</section>
