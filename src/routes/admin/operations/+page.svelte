<script lang="ts">
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'admin.operations.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate('de', 'admin.operations.title')}</h1>
	<p class="sensitive-notice">{translate('de', 'admin.operations.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<form class="admin-action-form" method="POST" action="?/run">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="idempotencyKey" value={data.commandKey} />
		<label>{translate('de', 'admin.operations.job')}
			<select name="jobName" required>
				{#each data.jobs as job}<option value={job}>{job}</option>{/each}
			</select>
		</label>
		<label class="checkbox">
			<input type="checkbox" name="confirmation" value="confirmed" required />
			<span>{translate('de', 'admin.operations.confirm')}</span>
		</label>
		<button type="submit">{translate('de', 'admin.operations.run')}</button>
	</form>
</section>

<section class="admin-section">
	<h2>{translate('de', 'admin.operations.history')}</h2>
	{#if data.runs.length === 0}<p>{translate('de', 'admin.operations.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.runs as run}
			<article class="admin-card">
				<p class="item-kicker">{run.job_name} · {run.status}</p>
				<p>{run.trigger_kind} · {run.started_at}</p>
				{#if run.finished_at}<p>{run.finished_at}</p>{/if}
				{#if run.error_code}<p>{translate('de', 'admin.operations.error')}: {run.error_code}</p>{/if}
				<pre class="safe-json">{JSON.stringify(run.safeResult, null, 2)}</pre>
			</article>
		{/each}
	</div>
</section>
