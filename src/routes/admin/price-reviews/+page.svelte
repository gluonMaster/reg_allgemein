<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euros = (cents: number | null) =>
		cents === null
			? '—'
			: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
</script>

<svelte:head><title>{translate('de', 'admin.priceReviews.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate('de', 'admin.priceReviews.title')}</h1>
	<p class="sensitive-notice">{translate('de', 'admin.priceReviews.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<details class="admin-card">
		<summary>{translate('de', 'admin.priceReviews.compareTitle')}</summary>
		<form class="admin-action-form" method="POST" action="?/compare">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.compareKey} />
			<label>{translate('de', 'admin.priceReviews.course')}
				<select name="courseGroupId" required>
					<option value="">—</option>
					{#each data.courses as course}<option value={course.id}>{course.name}</option>{/each}
				</select>
			</label>
			<label>{translate('de', 'admin.priceReviews.effectiveOn')}
				<input type="date" name="effectiveOn" required />
			</label>
			<label>{translate('de', 'admin.priceReviews.reason')}
				<textarea name="reason" minlength="3" maxlength="500" required></textarea>
			</label>
			<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required />
				<span>{translate('de', 'admin.priceReviews.confirmCompare')}</span></label>
			<button type="submit">{translate('de', 'admin.priceReviews.compare')}</button>
		</form>
	</details>

	<form class="admin-action-form admin-card" method="POST" action="?/maintenance">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="idempotencyKey" value={data.maintenanceKey} />
		<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required />
			<span>{translate('de', 'admin.priceReviews.confirmMaintenance')}</span></label>
		<button type="submit">{translate('de', 'admin.priceReviews.runMaintenance')}</button>
	</form>

	<h2>{translate('de', 'admin.priceReviews.batches')}</h2>
	{#if data.batches.length === 0}<p>{translate('de', 'admin.priceReviews.noBatches')}</p>{/if}
	<div class="admin-grid">
		{#each data.batches as batch}
			<article class="admin-card">
				<p class="item-kicker">{batch.reasonCode} · {batch.status}</p>
				<h3>{batch.courseName}</h3>
				<p>{translate('de', 'admin.priceReviews.effectiveOn')}: {batch.effectiveOn}</p>
				<p>{translate('de', 'admin.priceReviews.oldCount')}: {batch.oldActiveCount} · {translate('de', 'admin.priceReviews.newCount')}: {batch.newActiveCount}</p>
				<p>Items: {batch.itemCount} · Manual: {batch.manualCount}</p>
				{#if batch.status === 'pending_notification_approval'}
					<form class="admin-action-form" method="POST" action="?/approve">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="batchId" value={batch.id} />
						<input type="hidden" name="idempotencyKey" value={batch.approveKey} />
						<label>{translate('de', 'admin.priceReviews.reason')}<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.priceReviews.approveConfirm')}</span></label>
						<button type="submit">{translate('de', 'admin.priceReviews.approve')}</button>
					</form>
				{/if}
				{#if batch.status === 'notifications_approved'}
					<form class="admin-action-form" method="POST" action="?/dispatch">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="batchId" value={batch.id} />
						<input type="hidden" name="idempotencyKey" value={batch.dispatchKey} />
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.priceReviews.dispatchConfirm')}</span></label>
						<button type="submit">{translate('de', 'admin.priceReviews.dispatch')}</button>
					</form>
				{/if}
				<h4>{translate('de', 'admin.priceReviews.items')}</h4>
				<ul class="admin-list">
					{#each batch.items as item}
						<li>
							<p><strong>{item.status}</strong> · {item.targetKind} · {item.decisionCode}</p>
							<p>{euros(item.oldPriceCents)} → {euros(item.newFinalPriceCents)}</p>
							{#if item.status === 'accepted_by_parent'}
								<form class="admin-action-form" method="POST" action="?/finalConfirm">
									<input type="hidden" name="_csrf" value={data.csrfToken} />
									<input type="hidden" name="itemId" value={item.id} />
									<input type="hidden" name="idempotencyKey" value={item.finalKey} />
									<label>{translate('de', 'admin.priceReviews.reason')}<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>
									<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.priceReviews.finalConfirmCheck')}</span></label>
									<button type="submit">{translate('de', 'admin.priceReviews.finalConfirm')}</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
</section>

