<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import EvidenceText from '$lib/components/EvidenceText.svelte';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euros = (cents: number | null) =>
		cents === null
			? '—'
			: new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
	const actionable = $derived(data.item.status === 'sent');
</script>

<svelte:head><title>{translate(uiLocale, 'priceReviews.detail.title')}</title></svelte:head>

<main class="page-shell narrow-shell">
	<section class="panel">
		<p class="item-kicker">{data.courseName}</p>
		<h1>{translate(uiLocale, 'priceReviews.detail.title')}</h1>
		<p>{translate(uiLocale, 'cabinet.priceReviews.basePriceNotice')}</p>
		<dl class="summary-list">
			<div><dt>{translate(uiLocale, 'priceReviews.detail.oldPrice')}</dt><dd>{euros(data.item.oldPriceCents)}</dd></div>
			<div><dt>{translate(uiLocale, 'priceReviews.detail.newPrice')}</dt><dd>{euros(data.item.newFinalPriceCents)}</dd></div>
			{#if data.item.responseDeadline}
				<div><dt>{translate(uiLocale, 'priceReviews.detail.responseDeadline')}</dt><dd>{data.item.responseDeadline}</dd></div>
			{/if}
		</dl>
		<p>{translate(uiLocale, 'priceReviews.detail.effectiveRule')}</p>
		{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
		{#if actionable}
			<form class="stacked-form" method="POST" action="?/respond">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="itemHash" value={data.item.itemHash} />
				<input type="hidden" name="idempotencyKey" value={data.responseKey} />
				<p><EvidenceText messageKey="priceReviews.detail.acceptanceText" original={data.acceptanceText} /></p>
				<div class="button-row">
					<button type="submit" name="decision" value="accept">{translate(uiLocale, 'priceReviews.detail.accept')}</button>
					<button class="secondary" type="submit" name="decision" value="decline">{translate(uiLocale, 'priceReviews.detail.decline')}</button>
				</div>
			</form>
		{:else}
			<p>{translate(uiLocale, 'priceReviews.detail.notActionable')}</p>
		{/if}
		<p><a href="/cabinet">{translate(uiLocale, 'cabinet.title')}</a></p>
	</section>
</main>
