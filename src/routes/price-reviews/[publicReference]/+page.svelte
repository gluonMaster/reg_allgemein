<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euros = (cents: number | null) =>
		cents === null
			? '—'
			: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
	const actionable = $derived(data.item.status === 'sent');
</script>

<svelte:head><title>{translate('de', 'priceReviews.detail.title')}</title></svelte:head>

<main class="page-shell narrow-shell">
	<section class="panel">
		<p class="item-kicker">{data.courseName}</p>
		<h1>{translate('de', 'priceReviews.detail.title')}</h1>
		<p>{translate('de', 'cabinet.priceReviews.basePriceNotice')}</p>
		<dl class="summary-list">
			<div><dt>{translate('de', 'priceReviews.detail.oldPrice')}</dt><dd>{euros(data.item.oldPriceCents)}</dd></div>
			<div><dt>{translate('de', 'priceReviews.detail.newPrice')}</dt><dd>{euros(data.item.newFinalPriceCents)}</dd></div>
			{#if data.item.responseDeadline}
				<div><dt>{translate('de', 'priceReviews.detail.responseDeadline')}</dt><dd>{data.item.responseDeadline}</dd></div>
			{/if}
		</dl>
		<p>{translate('de', 'priceReviews.detail.effectiveRule')}</p>
		{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
		{#if actionable}
			<form class="stacked-form" method="POST" action="?/respond">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="itemHash" value={data.item.itemHash} />
				<input type="hidden" name="idempotencyKey" value={data.responseKey} />
				<p>{translate('de', 'priceReviews.detail.acceptanceText')}</p>
				<div class="button-row">
					<button type="submit" name="decision" value="accept">{translate('de', 'priceReviews.detail.accept')}</button>
					<button class="secondary" type="submit" name="decision" value="decline">{translate('de', 'priceReviews.detail.decline')}</button>
				</div>
			</form>
		{:else}
			<p>{translate('de', 'priceReviews.detail.notActionable')}</p>
		{/if}
		<p><a href="/cabinet">{translate('de', 'cabinet.title')}</a></p>
	</section>
</main>
