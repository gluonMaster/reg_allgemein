<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statuses = ['pending', 'processing', 'retry', 'sent', 'dead', 'cancelled', 'delivery_unknown'] as const;
</script>

<svelte:head><title>{translate('de', 'admin.outbox.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate('de', 'admin.outbox.title')}</h1>
	<p class="sensitive-notice">{translate('de', 'admin.outbox.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form class="admin-filter" method="GET">
		<label>{translate('de', 'admin.search')}<input name="q" value={data.query.q} /></label>
		<label>{translate('de', 'admin.outbox.channel')}<select name="channel">
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="email" selected={data.query.channel === 'email'}>E-Mail</option>
			<option value="telegram" selected={data.query.channel === 'telegram'}>Telegram</option>
		</select></label>
		<label>{translate('de', 'admin.status')}<select name="status">
			<option value="">{translate('de', 'admin.all')}</option>
			{#each statuses as status}<option value={status} selected={data.query.status === status}>{status}</option>{/each}
		</select></label>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.rows.length === 0}<p>{translate('de', 'admin.outbox.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.rows as row}
			<article class="admin-card">
				<p class="item-kicker">{row.channel} · {row.status}</p>
				<h2>{row.templateOrCategory}</h2>
				<p>{row.sourceKind} · {row.sourceId}</p>
				<p>{translate('de', 'admin.outbox.attempts')}: {row.attempts}/{row.maxAttempts}</p>
				{#if row.deliveryReference}<p>{translate('de', 'admin.outbox.deliveryReference')}: {row.deliveryReference}</p>{/if}
				{#if row.deliveryAttemptNo && row.deliveryStartedAt}<p>Attempt {row.deliveryAttemptNo} · {row.deliveryStartedAt}</p>{/if}
				{#if row.lastErrorCode}<p>{translate('de', 'admin.outbox.error')}: {row.lastErrorCode}</p>{/if}
				{#if row.status === 'delivery_unknown'}
					<p>{translate('de', 'admin.outbox.unknownNotice')}</p>
					<form class="admin-action-form" method="POST" action="?/resolveTelegram">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="idempotencyKey" value={row.commandKey} />
						<input type="hidden" name="outboxId" value={row.id} />
						<input type="hidden" name="attemptId" value={row.deliveryAttemptId} />
						<label>{translate('de', 'admin.outbox.resolution')}<select name="outboxAction" required>
							<option value="" disabled selected>{translate('de', 'admin.outbox.resolution')}</option>
							<option value="confirm_sent">{translate('de', 'admin.outbox.confirmSent')}</option>
							<option value="retry_after_review">{translate('de', 'admin.outbox.retryAfterReview')}</option>
							<option value="cancel">{translate('de', 'admin.outbox.abandonUnknown')}</option>
						</select></label>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.outbox.unknownConfirm')}</span></label>
						<button type="submit">{translate('de', 'admin.outbox.resolve')}</button>
					</form>
				{:else if row.status === 'dead' || row.status === 'pending' || row.status === 'retry'}
					<form class="admin-action-form" method="POST" action="?/change">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="idempotencyKey" value={row.commandKey} />
						<input type="hidden" name="channel" value={row.channel} />
						<input type="hidden" name="outboxId" value={row.id} />
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.outbox.confirm')}</span></label>
						{#if row.status === 'dead'}<button name="outboxAction" value="retry" type="submit">{translate('de', 'admin.outbox.retry')}</button>{/if}
						{#if row.status === 'pending' || row.status === 'retry'}<button name="outboxAction" value="cancel" type="submit">{translate('de', 'admin.outbox.cancel')}</button>{/if}
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
