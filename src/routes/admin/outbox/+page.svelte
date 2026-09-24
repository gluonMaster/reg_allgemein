<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { formatMessage, translate, translateOutboxTemplate, translateOutboxWait } from '$lib/i18n';
	import { formatBerlinTime, normalizeUiLocale } from '$lib/i18n/locale';
	import OutboxIntakeContext from '$lib/trial-intake/components/OutboxIntakeContext.svelte';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const statuses = ['pending', 'processing', 'retry', 'sent', 'dead', 'cancelled', 'delivery_unknown'] as const;
</script>

<svelte:head><title>{translate(uiLocale, 'admin.outbox.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate(uiLocale, 'admin.outbox.title')}</h1>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.outbox.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form class="admin-filter" method="GET">
		<label>{translate(uiLocale, 'admin.search')}<input name="q" value={data.query.q} /></label>
		<label>{translate(uiLocale, 'admin.outbox.channel')}<select name="channel">
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			<option value="email" selected={data.query.channel === 'email'}>{translate(uiLocale, 'ui.email')}</option>
			<option value="telegram" selected={data.query.channel === 'telegram'}>Telegram</option>
		</select></label>
		<label>{translate(uiLocale, 'admin.status')}<select name="status">
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			{#each statuses as status}<option value={status} selected={data.query.status === status}>{translateAdminCode(uiLocale, status)}</option>{/each}
		</select></label>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.rows.length === 0}<p>{translate(uiLocale, 'admin.outbox.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.rows as row}
			{@const sameRequest = row.sourceKind === 'trial_intake'}
			{@const intake = sameRequest ? data.intake[row.sourceId] : undefined}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, row.channel)} · {translateAdminCode(uiLocale, row.status)}</p>
				<h2>{translateOutboxTemplate(uiLocale, row.templateOrCategory)}</h2>
				{#if intake}<OutboxIntakeContext context={intake} requestId={row.sourceId} locale={normalizeUiLocale(uiLocale)} />
				{:else}<p>{translateAdminCode(uiLocale, row.sourceKind)} · {row.sourceId}</p>{/if}
				{#if row.wait}<p><strong>{translateOutboxWait(uiLocale, row.wait, sameRequest)}</strong></p>{/if}
				<p>{translate(uiLocale, 'admin.outbox.queuedAt')}: {formatBerlinTime(uiLocale, row.createdAt)}</p>
				<p>{translate(uiLocale, 'admin.outbox.attempts')}: {row.attempts}/{row.maxAttempts}</p>
				{#if row.deliveryReference}<p>{translate(uiLocale, 'admin.outbox.deliveryReference')}: <code>{row.deliveryReference}</code></p>{/if}
				{#if row.deliveryAttemptNo && row.deliveryStartedAt}<p>{translate(uiLocale, 'ui.outbox.attempt')} {row.deliveryAttemptNo} · {formatBerlinTime(uiLocale, row.deliveryStartedAt)}</p>{/if}
				{#if row.sentAt}<p>{translate(uiLocale, 'admin.outbox.sentAt')}: {formatBerlinTime(uiLocale, row.sentAt)}</p>{/if}
				{#if row.lastErrorCode}<p>{translate(uiLocale, 'admin.outbox.error')}: {row.lastErrorCode}</p>{/if}
				{#if row.status === 'delivery_unknown'}
					<p>{translate(uiLocale, 'admin.outbox.unknownNotice')}</p>
					<p>{formatMessage(uiLocale, sameRequest ? 'admin.outbox.unknownStepsRequest' : 'admin.outbox.unknownSteps', { reference: row.deliveryReference ?? '—' })}</p>
					<p><strong>{translate(uiLocale, sameRequest ? 'admin.outbox.unknownBlocksRequest' : 'admin.outbox.unknownBlocksDestination')}</strong></p>
					{#if sameRequest}<p>{translate(uiLocale, 'admin.outbox.unknownAlerted')}</p>{/if}
					<form class="admin-action-form" method="POST" action="?/resolveTelegram">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="idempotencyKey" value={row.commandKey} />
						<input type="hidden" name="outboxId" value={row.id} />
						<input type="hidden" name="attemptId" value={row.deliveryAttemptId} />
						<label>{translate(uiLocale, 'admin.outbox.resolution')}<select name="outboxAction" required>
							<option value="" disabled selected>{translate(uiLocale, 'admin.outbox.resolution')}</option>
							<option value="confirm_sent">{translate(uiLocale, 'admin.outbox.confirmSent')}</option>
							<option value="retry_after_review">{translate(uiLocale, 'admin.outbox.retryAfterReview')}</option>
							<option value="cancel">{translate(uiLocale, 'admin.outbox.abandonUnknown')}</option>
						</select></label>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.outbox.unknownConfirm')}</span></label>
						<button type="submit">{translate(uiLocale, 'admin.outbox.resolve')}</button>
					</form>
				{:else if row.status === 'dead'}
					{#if row.channel === 'telegram'}<p><strong>{translate(uiLocale, sameRequest ? 'admin.outbox.deadRequest' : 'admin.outbox.deadBlocksLane')}</strong></p>{/if}
					<form class="admin-action-form" method="POST" action="?/change">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="idempotencyKey" value={row.commandKey} />
						<input type="hidden" name="channel" value={row.channel} />
						<input type="hidden" name="outboxId" value={row.id} />
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.outbox.confirm')}</span></label>
						<button name="outboxAction" value="retry" type="submit">{translate(uiLocale, 'admin.outbox.retry')}</button>
					</form>
				{:else if row.status === 'pending' || row.status === 'retry'}
					<!-- Cancelling a queued message is rare; the normal path is to let it send. -->
					<details>
						<summary>{translate(uiLocale, 'admin.outbox.moreActions')}</summary>
						<form class="admin-action-form" method="POST" action="?/change">
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="idempotencyKey" value={row.commandKey} />
							<input type="hidden" name="channel" value={row.channel} />
							<input type="hidden" name="outboxId" value={row.id} />
							<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.outbox.confirm')}</span></label>
							<button class="secondary-button" name="outboxAction" value="cancel" type="submit">{translate(uiLocale, 'admin.outbox.cancel')}</button>
						</form>
					</details>
				{/if}
			</article>
		{/each}
	</div>
</section>
