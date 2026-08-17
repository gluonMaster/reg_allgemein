<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<a href="/admin/imports">← {translate('de', 'admin.imports.title')}</a>
	<h2>{translate('de', 'admin.imports.detail')}</h2>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<dl class="admin-detail-grid">
		<div>
			<dt>{translate('de', 'admin.kind')}</dt>
			<dd>{data.run.source_kind}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.period')}</dt>
			<dd>{data.run.academic_period}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.status')}</dt>
			<dd>{translateAdminCode('de', data.run.status)}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.imports.rows')}</dt>
			<dd>{data.run.rows_promoted}/{data.run.rows_total}</dd>
		</div>
	</dl>
	<h3>{translate('de', 'admin.imports.safeSummary')}</h3>
	<pre class="safe-json">{JSON.stringify(data.run.safeSummary, null, 2)}</pre>
	<h3>{translate('de', 'admin.imports.issues')}</h3>
	{#if data.run.issues.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.run.issues as issue, index}
			<article class="admin-card">
				<h4>{issue.code}</h4>
				<p>{issue.severity} · {translateAdminCode('de', issue.status)}</p>
				{#if issue.source_record_key}<p><code>{issue.source_record_key}</code></p>{/if}
				{#if issue.legacyFamilyId}
					<p>
						<a href={`/admin/legacy/${issue.legacyFamilyId}`}
							>{translate('de', 'admin.imports.openFamily')}</a
						>
					</p>
				{/if}
				<pre class="safe-json">{JSON.stringify(issue.safeContext, null, 2)}</pre>
				{#if issue.status === 'open'}
					<form method="POST" action="?/decideIssue" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="issueId" value={issue.id} />
						<input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:issue:${index}`}
						/>
						<label for={`issue-decision-${index}`}
							>{translate('de', 'admin.decision')}</label
						>
						<select id={`issue-decision-${index}`} name="decision" required>
							<option value="resolve">{translate('de', 'admin.resolve')}</option>
							<option value="dismiss">{translate('de', 'admin.dismiss')}</option>
						</select>
						<label for={`issue-reason-${index}`}
							>{translate('de', 'admin.reason')}</label
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
							/><span>{translate('de', 'admin.confirmAction')}</span></label
						>
						<button type="submit">{translate('de', 'admin.apply')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
