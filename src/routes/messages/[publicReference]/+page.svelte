<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'messages.detail')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate(uiLocale, 'cabinet.navigationLabel')}>
		<a href="/messages">{translate(uiLocale, 'messages.back')}</a>
	</nav>
	<h1>{data.thread.subject}</h1>
	<p class="item-kicker">{translate(uiLocale, `messages.category.${data.thread.category}` as 'messages.category.other')} · {translate(uiLocale, `messages.status.${data.thread.status}` as 'messages.status.open')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'messages.detail')}</h2>
		<div class="activity-list">
			{#each data.thread.messages as message}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, `messages.sender.${message.senderKind}` as 'messages.sender.parent')} · {message.createdAt}</p>
					<p class="message-body">{message.body}</p>
				</article>
			{/each}
		</div>
	</section>

	{#if data.thread.status === 'waiting_for_parent' || data.thread.status === 'answered'}
		<section class="cabinet-card">
			<h2>{translate(uiLocale, 'messages.add')}</h2>
			<form class="admin-action-form" method="POST" action="?/append">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="idempotencyKey" value={data.commandKey} />
				<label>{translate(uiLocale, 'messages.message')}<textarea name="message" maxlength="4000" required></textarea></label>
				<button type="submit">{translate(uiLocale, 'messages.add')}</button>
			</form>
		</section>
	{:else if data.thread.status === 'closed'}
		<p>{translate(uiLocale, 'messages.closedNotice')}</p>
	{/if}

	{#if data.thread.status !== 'closed'}
		<form class="admin-action-form cabinet-card" method="POST" action="?/close">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:close`} />
			<button type="submit">{translate(uiLocale, 'messages.close')}</button>
		</form>
	{/if}
</main>

