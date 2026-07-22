<script lang="ts">
	import '../../../app.css';
	import { translate, translatePrivacyCategory, translatePrivacyStatus } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'privacy.title')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate('de', 'cabinet.navigationLabel')}>
		<a href="/cabinet">{translate('de', 'cabinet.link.cabinet')}</a>
		<a href="/account/security">{translate('de', 'cabinet.link.security')}</a>
	</nav>
	<h1>{translate('de', 'privacy.title')}</h1>
	<p>{translate('de', 'privacy.intro')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate('de', 'privacy.export.title')}</h2>
		<p>{translate('de', 'privacy.export.notice')}</p>
		<form method="POST" action="?/exportData">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:export`} />
			<button type="submit">{translate('de', 'privacy.export.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card danger-card">
		<h2>{translate('de', 'privacy.delete.title')}</h2>
		<h3>{translate('de', 'privacy.delete.dryRun')}</h3>
		<h4>{translate('de', 'privacy.delete.activeContracts')}</h4>
		{#if data.inventory.activeContracts.length === 0}
			<p>{translate('de', 'privacy.delete.noBlockers')}</p>
		{:else}
			<ul>{#each data.inventory.activeContracts as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
		{/if}
		<h4>{translate('de', 'privacy.delete.retained')}</h4>
		<ul>{#each data.inventory.retainedCategories as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
		<p>{translate('de', 'privacy.delete.retentionNotice')}</p>
		<h4>{translate('de', 'privacy.delete.holds')}</h4>
		<p>{data.inventory.holdCount}</p>
		<h4>{translate('de', 'privacy.delete.cleanup')}</h4>
		<ul>{#each data.inventory.d1Cleanup as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
		<h4>{translate('de', 'privacy.delete.r2Cleanup')}</h4>
		<ul>{#each data.inventory.r2Cleanup as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
		<form method="POST" action="?/requestDeletion">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:delete`} />
			<button type="submit">{translate('de', 'privacy.delete.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate('de', 'privacy.history.title')}</h2>
		{#if data.requests.length === 0}<p>{translate('de', 'privacy.history.empty')}</p>{/if}
		<ul>
			{#each data.requests as request}
				<li>
					{request.public_reference} · {translatePrivacyStatus('de', request.status)}
					{#if request.artifact_id && request.artifact_expires_at && request.artifact_expires_at > data.now}
						· <a href={`/account/privacy/exports/${request.artifact_id}/download`}>{translate('de', 'privacy.export.download')}</a>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
</main>
