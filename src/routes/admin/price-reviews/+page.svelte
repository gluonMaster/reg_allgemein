<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
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
</script>

<svelte:head><title>{translate(uiLocale, 'admin.priceReviews.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate(uiLocale, 'admin.priceReviews.title')}</h1>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.priceReviews.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<details class="admin-card">
		<summary>{translate(uiLocale, 'admin.priceReviews.compareTitle')}</summary>
		<form class="admin-action-form" method="POST" action="?/compare">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.compareKey} />
			<label>{translate(uiLocale, 'admin.priceReviews.course')}
				<select name="courseGroupId" required>
					<option value="">—</option>
					{#each data.courses as course}<option value={course.id}>{course.name}</option>{/each}
				</select>
			</label>
			<label>{translate(uiLocale, 'admin.priceReviews.effectiveOn')}
				<input type="date" name="effectiveOn" required />
			</label>
			<label>{translate(uiLocale, 'admin.priceReviews.reason')}
				<textarea name="reason" minlength="3" maxlength="500" required></textarea>
			</label>
			<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required />
				<span>{translate(uiLocale, 'admin.priceReviews.confirmCompare')}</span></label>
			<button type="submit">{translate(uiLocale, 'admin.priceReviews.compare')}</button>
		</form>
	</details>

	<form class="admin-action-form admin-card" method="POST" action="?/maintenance">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="idempotencyKey" value={data.maintenanceKey} />
		<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required />
			<span>{translate(uiLocale, 'admin.priceReviews.confirmMaintenance')}</span></label>
		<button type="submit">{translate(uiLocale, 'admin.priceReviews.runMaintenance')}</button>
	</form>

	<h2>{translate(uiLocale, 'admin.priceReviews.batches')}</h2>
	{#if data.batches.length === 0}<p>{translate(uiLocale, 'admin.priceReviews.noBatches')}</p>{/if}
	<div class="admin-grid">
		{#each data.batches as batch}
			<article class="admin-card">
				<p class="item-kicker">{batch.reasonCode} · {translateAdminCode(uiLocale, batch.status)}</p>
				<h3>{batch.courseName}</h3>
				<p>{translate(uiLocale, 'admin.priceReviews.effectiveOn')}: {batch.effectiveOn}</p>
				<p>{translate(uiLocale, 'admin.priceReviews.oldCount')}: {batch.oldActiveCount} · {translate(uiLocale, 'admin.priceReviews.newCount')}: {batch.newActiveCount}</p>
				<p>{translate(uiLocale, 'ui.priceReviews.items')} {batch.itemCount} {translate(uiLocale, 'ui.priceReviews.manual')} {batch.manualCount}</p>
				{#if batch.status === 'pending_notification_approval'}
					<form class="admin-action-form" method="POST" action="?/approve">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="batchId" value={batch.id} />
						<input type="hidden" name="idempotencyKey" value={batch.approveKey} />
						<label>{translate(uiLocale, 'admin.priceReviews.reason')}<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.priceReviews.approveConfirm')}</span></label>
						<button type="submit">{translate(uiLocale, 'admin.priceReviews.approve')}</button>
					</form>
				{/if}
				{#if batch.status === 'notifications_approved'}
					<form class="admin-action-form" method="POST" action="?/dispatch">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="batchId" value={batch.id} />
						<input type="hidden" name="idempotencyKey" value={batch.dispatchKey} />
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.priceReviews.dispatchConfirm')}</span></label>
						<button type="submit">{translate(uiLocale, 'admin.priceReviews.dispatch')}</button>
					</form>
				{/if}
				<h4>{translate(uiLocale, 'admin.priceReviews.items')}</h4>
				<ul class="admin-list">
					{#each batch.items as item}
						<li>
							<p><strong>{translateAdminCode(uiLocale, item.status)}</strong> · {translateAdminCode(uiLocale, item.targetKind)} · {translateAdminCode(uiLocale, item.decisionCode)}</p>
							<p>{euros(item.oldPriceCents)} → {euros(item.newFinalPriceCents)}</p>
							{#if item.status === 'accepted_by_parent'}
								<form class="admin-action-form" method="POST" action="?/finalConfirm">
									<input type="hidden" name="_csrf" value={data.csrfToken} />
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="idempotencyKey" value={item.finalKey} />
									<label>{translate(uiLocale, 'admin.priceReviews.reason')}<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>
									<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.priceReviews.finalConfirmCheck')}</span></label>
									<button type="submit">{translate(uiLocale, 'admin.priceReviews.finalConfirm')}</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
</section>

