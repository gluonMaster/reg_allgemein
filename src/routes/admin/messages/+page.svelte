<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	const supportCategories = ['absence', 'technical', 'contract', 'payment', 'schedule', 'nachhilfe', 'other'] as const;
	import { translate } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const statuses = ['waiting_for_admin', 'waiting_for_parent', 'answered', 'closed'] as const;
</script>

<svelte:head><title>{translate(uiLocale, 'admin.messages.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate(uiLocale, 'admin.messages.title')}</h1>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.messages.notice')}</p>
	<form class="admin-filter" method="GET">
		<label>{translate(uiLocale, 'admin.search')}<input name="q" value={data.query.q} /></label>
		<label>{translate(uiLocale, 'admin.status')}
			<select name="status"><option value="">{translate(uiLocale, 'admin.all')}</option>
				{#each statuses as status}<option value={status} selected={data.query.status === status}>{translate(uiLocale, `messages.status.${status}` as 'messages.status.closed')}</option>{/each}
			</select>
		</label>
		<label>{translate(uiLocale, 'messages.category')}
			<select name="kind"><option value="">{translate(uiLocale, 'admin.all')}</option>
				{#each supportCategories as category}<option value={category} selected={data.query.kind === category}>{translate(uiLocale, `messages.category.${category}` as 'messages.category.other')}</option>{/each}
			</select>
		</label>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.threads.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.threads as thread}
			<article class="admin-card">
				<p class="item-kicker">{translate(uiLocale, `messages.category.${thread.category}` as 'messages.category.other')} · {translate(uiLocale, `messages.status.${thread.status}` as 'messages.status.closed')}</p>
				<h2>{thread.subject}</h2>
				<p>{thread.updatedAt} · {thread.messageCount}</p>
				<a href={`/admin/messages/${thread.publicReference}`}>{translate(uiLocale, 'messages.open')}</a>
			</article>
		{/each}
	</div>
</section>
