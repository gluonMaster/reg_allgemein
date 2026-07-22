<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'messages.detail')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate('de', 'cabinet.navigationLabel')}>
		<a href="/messages">{translate('de', 'messages.back')}</a>
	</nav>
	<h1>{data.thread.subject}</h1>
	<p class="item-kicker">{translate('de', `messages.category.${data.thread.category}` as 'messages.category.other')} · {translate('de', `messages.status.${data.thread.status}` as 'messages.status.open')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate('de', 'messages.detail')}</h2>
		<div class="activity-list">
			{#each data.thread.messages as message}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', `messages.sender.${message.senderKind}` as 'messages.sender.parent')} · {message.createdAt}</p>
					<p class="message-body">{message.body}</p>
				</article>
			{/each}
		</div>
	</section>

	{#if data.thread.status === 'waiting_for_parent' || data.thread.status === 'answered'}
		<section class="cabinet-card">
			<h2>{translate('de', 'messages.add')}</h2>
			<form class="admin-action-form" method="POST" action="?/append">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="idempotencyKey" value={data.commandKey} />
				<label>{translate('de', 'messages.message')}<textarea name="message" maxlength="4000" required></textarea></label>
				<button type="submit">{translate('de', 'messages.add')}</button>
			</form>
		</section>
	{:else if data.thread.status === 'closed'}
		<p>{translate('de', 'messages.closedNotice')}</p>
	{/if}

	{#if data.thread.status !== 'closed'}
		<form class="admin-action-form cabinet-card" method="POST" action="?/close">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:close`} />
			<button type="submit">{translate('de', 'messages.close')}</button>
		</form>
	{/if}
</main>

