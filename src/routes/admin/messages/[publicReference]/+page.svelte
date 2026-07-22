<script lang="ts">
	import '../../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'admin.messages.title')}</title></svelte:head>

<section class="admin-section">
	<p><a href="/admin/messages">← {translate('de', 'admin.messages.title')}</a></p>
	<h1>{data.thread.subject}</h1>
	<p class="item-kicker">{translate('de', `messages.category.${data.thread.category}` as 'messages.category.other')} · {translate('de', `messages.status.${data.thread.status}` as 'messages.status.closed')}</p>
	<p class="sensitive-notice">{translate('de', 'admin.messages.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<div class="admin-grid">
		{#each data.thread.messages as message}
			<article class="admin-card">
				<p class="item-kicker">{translate('de', `messages.sender.${message.senderKind}` as 'messages.sender.parent')} · {message.createdAt}</p>
				<p class="message-body">{message.body}</p>
			</article>
		{/each}
	</div>
	{#if data.thread.status === 'waiting_for_admin'}
		<form class="admin-action-form admin-card" method="POST" action="?/reply">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.commandKey} />
			<label>{translate('de', 'messages.message')}<textarea name="message" maxlength="4000" required></textarea></label>
			<label><input type="radio" name="outcome" value="waiting_for_parent" checked /> {translate('de', 'admin.messages.waitReply')}</label>
			<label><input type="radio" name="outcome" value="answered" /> {translate('de', 'admin.messages.finalReply')}</label>
			<button type="submit">{translate('de', 'admin.messages.reply')}</button>
		</form>
	{/if}
	{#if data.thread.status !== 'closed'}
		<form class="admin-action-form admin-card" method="POST" action="?/close">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:close`} />
			<button type="submit">{translate('de', 'admin.messages.close')}</button>
		</form>
	{/if}
</section>

