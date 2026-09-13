<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<a href="/admin/imports">← {translate(uiLocale, 'admin.imports.title')}</a>
	<h2>{translate(uiLocale, 'admin.imports.detail')}</h2>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<dl class="admin-detail-grid">
		<div>
			<dt>{translate(uiLocale, 'admin.kind')}</dt>
			<dd>{translateAdminCode(uiLocale, data.run.source_kind)}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.period')}</dt>
			<dd>{data.run.academic_period}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.status')}</dt>
			<dd>{translateAdminCode(uiLocale, data.run.status)}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.imports.rows')}</dt>
			<dd>{data.run.rows_promoted}/{data.run.rows_total}</dd>
		</div>
	</dl>
	<h3>{translate(uiLocale, 'admin.imports.safeSummary')}</h3>
	<pre class="safe-json">{JSON.stringify(data.run.safeSummary, null, 2)}</pre>
	<h3>{translate(uiLocale, 'admin.imports.issues')}</h3>
	{#if data.run.issues.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.run.issues as issue, index}
			<article class="admin-card">
				<h4>{issue.code}</h4>
				<p>{issue.severity} · {translateAdminCode(uiLocale, issue.status)}</p>
				{#if issue.source_record_key}<p><code>{issue.source_record_key}</code></p>{/if}
				{#if issue.legacyFamilyId}
					<p>
						<a href={`/admin/legacy/${issue.legacyFamilyId}`}
							>{translate(uiLocale, 'admin.imports.openFamily')}</a
						>
					</p>
				{/if}
				{#if issue.reconciliation_case_id}
					<p>
						<a
							href={`/admin/import-reconciliation?case=${issue.reconciliation_case_id}`}
							>{translate(uiLocale, 'ui.import.reconciliation')}</a
						>
					</p>
				{/if}
				<pre class="safe-json">{JSON.stringify(issue.safeContext, null, 2)}</pre>
				{#if issue.status === 'open' && !issue.reconciliation_case_id}
					<form method="POST" action="?/decideIssue" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="issueId" value={issue.id} />
						<input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:issue:${index}`}
						/>
						<label for={`issue-decision-${index}`}
							>{translate(uiLocale, 'admin.decision')}</label
						>
						<select id={`issue-decision-${index}`} name="decision" required>
							<option value="resolve">{translate(uiLocale, 'admin.resolve')}</option>
							<option value="dismiss">{translate(uiLocale, 'admin.dismiss')}</option>
						</select>
						<label for={`issue-reason-${index}`}
							>{translate(uiLocale, 'admin.reason')}</label
						>
						<textarea
							id={`issue-reason-${index}`}
							name="reason"
							required
							maxlength="1000"
						></textarea>
						<label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span>{translate(uiLocale, 'admin.confirmAction')}</span></label
						>
						<button type="submit">{translate(uiLocale, 'admin.apply')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
