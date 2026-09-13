<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import type { ActionData, PageData } from './$types';
	import { formatMessage, translate, type MessageKey } from '$lib/i18n';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const editable = $derived(['draft', 'needs_documents', 'needs_info'].includes(data.request.status));
	const cancellable = $derived(!['cancelled', 'rejected'].includes(data.request.status));
	const currentAuthorization = $derived(data.request.authorizations.find((item) => item.status === 'pending_review') ?? data.request.authorizations.find((item) => item.status === 'approved'));
	const statusText = (status: string, document = false) =>
		translate(uiLocale, `${document ? 'request.document.status' : 'request.status'}.${status}` as MessageKey);
	const euro = $derived(new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }));
</script>

<svelte:head><title>{translate(uiLocale, 'request.detail.title')}</title></svelte:head>

<main class="request-shell">
	<nav class="auth-nav"><a href="/cabinet">{translate(uiLocale, 'request.link.cabinet')}</a><a href="/catalog">{translate(uiLocale, 'request.link.catalog')}</a></nav>
	<p class="item-kicker">{statusText(data.request.status)}</p>
	<h1>{formatMessage(uiLocale, 'request.detail.heading', { kind: translate(uiLocale, data.request.requestKind === 'nachhilfe' ? 'request.kind.nachhilfe' : 'request.kind.individual'), child: data.request.childName })}</h1>
	<p>{formatMessage(uiLocale, data.request.parentPayable ? 'request.rate.parentShort' : 'request.rate.fundedShort', { amount: euro.format(data.request.unitRateCents / 100) })}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'request.fields')}</h2>
		<form method="POST" action="?/save" class="request-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} /><input type="hidden" name="idempotencyKey" value={`${data.commandKey}:save`} />
			<input type="hidden" name="expectedVersion" value={data.request.version} /><input type="hidden" name="childId" value={data.request.childId} /><input type="hidden" name="requestKind" value={data.request.requestKind} />
			{#if data.request.requestKind === 'nachhilfe'}<label for="funding-kind">{translate(uiLocale, 'request.fundingKind')}</label><select id="funding-kind" name="fundingKind" disabled={!editable}><option value="jobcenter" selected={data.request.fundingKind === 'jobcenter'}>{translate(uiLocale, 'request.funding.jobcenter')}</option><option value="socialamt" selected={data.request.fundingKind === 'socialamt'}>{translate(uiLocale, 'request.funding.socialamt')}</option></select>{/if}
			<label for="subjects">{translate(uiLocale, 'request.subjects')}</label><input id="subjects" name="subjects" value={data.request.subjects} maxlength="500" required disabled={!editable} />
			<label for="description">{translate(uiLocale, 'request.description')}</label><textarea id="description" name="description" maxlength="2000" disabled={!editable}>{data.request.description}</textarea>
			<fieldset disabled={!editable}><legend>{translate(uiLocale, 'request.preferredDays')}</legend>{#each ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as day}<label class="checkbox"><input type="checkbox" name="preferredDays" value={day} checked={data.request.preferredDays.includes(day)} /><span>{translate(uiLocale, `request.day.${day}` as MessageKey)}</span></label>{/each}</fieldset>
			<label for="preferred-format">{translate(uiLocale, 'request.preferredFormat')}</label><select id="preferred-format" name="preferredFormat" disabled={!editable}><option value="onsite" selected={data.request.preferredFormat === 'onsite'}>{translate(uiLocale, 'request.format.onsite')}</option><option value="online" selected={data.request.preferredFormat === 'online'}>{translate(uiLocale, 'request.format.online')}</option><option value="mixed" selected={data.request.preferredFormat === 'mixed'}>{translate(uiLocale, 'request.format.mixed')}</option></select>
			<label for="preferred-locations">{translate(uiLocale, 'request.preferredLocations')}</label><textarea id="preferred-locations" name="preferredLocations" disabled={!editable}>{data.request.preferredLocations.join('\n')}</textarea>
			{#if editable}<button type="submit">{translate(uiLocale, 'request.save')}</button>{/if}
		</form>
		{#if editable}<form method="POST" action="?/submit" class="inline-action"><input type="hidden" name="_csrf" value={data.csrfToken} /><input type="hidden" name="expectedVersion" value={data.request.version} /><input type="hidden" name="idempotencyKey" value={`${data.commandKey}:submit`} /><button type="submit">{translate(uiLocale, 'request.submit')}</button></form>{/if}
		{#if cancellable}<form method="POST" action="?/cancel" class="inline-action"><input type="hidden" name="_csrf" value={data.csrfToken} /><input type="hidden" name="expectedVersion" value={data.request.version} /><input type="hidden" name="idempotencyKey" value={`${data.commandKey}:cancel`} /><button type="submit" class="secondary-button">{translate(uiLocale, 'request.cancel')}</button></form>{/if}
	</section>

	{#if data.request.requestKind === 'nachhilfe'}
		<section class="cabinet-card">
			<h2>{translate(uiLocale, 'request.document.title')}</h2>
			<p>{translate(uiLocale, 'request.document.notice')}</p>
			{#if currentAuthorization && editable}
				<form method="POST" action="?/upload" enctype="multipart/form-data">
					<input type="hidden" name="_csrf" value={data.csrfToken} /><input type="hidden" name="authorizationId" value={currentAuthorization.id} /><input type="hidden" name="idempotencyKey" value={`${data.commandKey}:upload`} />
					<label for="funding-document">{translate(uiLocale, 'request.document.label')}</label><input id="funding-document" name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required />
					<button type="submit">{translate(uiLocale, 'request.document.upload')}</button>
				</form>
			{/if}
			<div class="document-list">
				{#each data.request.documents as document, index}
					<article class="document-card"><p class="item-kicker">{statusText(document.reviewStatus, true)}</p><h3>{document.extension.toUpperCase()} · {(document.sizeBytes / 1024).toFixed(0)} {translate(uiLocale, 'ui.kibibyte')}</h3><p>{formatMessage(uiLocale, 'request.document.checksum', { checksum: document.shortSha256 })}</p>
						{#if document.reviewStatus === 'approved'}<a href={`/requests/documents/${encodeURIComponent(document.id)}/download`}>{translate(uiLocale, 'request.document.download')}</a>{/if}
						{#if ['quarantined', 'clean', 'infected', 'rejected'].includes(document.reviewStatus)}<form method="POST" action="?/deleteDocument"><input type="hidden" name="_csrf" value={data.csrfToken} /><input type="hidden" name="documentId" value={document.id} /><input type="hidden" name="idempotencyKey" value={`${data.commandKey}:delete:${index}`} /><button type="submit" class="secondary-button">{translate(uiLocale, 'request.document.delete')}</button></form>{/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}
</main>
