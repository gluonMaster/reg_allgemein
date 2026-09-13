<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'admin.operations.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate(uiLocale, 'admin.operations.title')}</h1>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.operations.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<form class="admin-action-form" method="POST" action="?/run">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="idempotencyKey" value={data.commandKey} />
		<label
			>{translate(uiLocale, 'admin.operations.job')}
			<select name="jobName" required>
				{#each data.jobs as job}<option value={job}>{translateAdminCode(uiLocale, job)}</option>{/each}
			</select>
		</label>
		<label class="checkbox">
			<input type="checkbox" name="confirmation" value="confirmed" required />
			<span>{translate(uiLocale, 'admin.operations.confirm')}</span>
		</label>
		<button type="submit">{translate(uiLocale, 'admin.operations.run')}</button>
	</form>
</section>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.operations.cadences')}</h2>
	<div class="admin-list">
		{#each data.cadences as cadence}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, cadence.cadence)} · {translateAdminCode(uiLocale, cadence.status)}</p>
				{#if cadence.started_at}<p>{cadence.started_at}</p>{/if}
				{#if cadence.finished_at}<p>{cadence.finished_at}</p>{/if}
				<pre class="safe-json">{JSON.stringify(cadence.safeResult, null, 2)}</pre>
			</article>
		{/each}
	</div>
</section>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.operations.history')}</h2>
	{#if data.runs.length === 0}<p>{translate(uiLocale, 'admin.operations.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.runs as run}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, run.job_name)} · {translateAdminCode(uiLocale, run.status)}</p>
				<p>{translateAdminCode(uiLocale, run.trigger_kind)} · {run.started_at}</p>
				{#if run.finished_at}<p>{run.finished_at}</p>{/if}
				{#if run.error_code}<p>
						{translate(uiLocale, 'admin.operations.error')}: {run.error_code}
					</p>{/if}
				<pre class="safe-json">{JSON.stringify(run.safeResult, null, 2)}</pre>
			</article>
		{/each}
	</div>
</section>
