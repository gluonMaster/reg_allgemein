<script lang="ts">
	import '../../../app.css';
	const supportCategories = ['absence', 'technical', 'contract', 'payment', 'schedule', 'nachhilfe', 'other'] as const;
	import { translate } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const statuses = ['waiting_for_admin', 'waiting_for_parent', 'answered', 'closed'] as const;
</script>

<svelte:head><title>{translate('de', 'admin.messages.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate('de', 'admin.messages.title')}</h1>
	<p class="sensitive-notice">{translate('de', 'admin.messages.notice')}</p>
	<form class="admin-filter" method="GET">
		<label>{translate('de', 'admin.search')}<input name="q" value={data.query.q} /></label>
		<label>{translate('de', 'admin.status')}
			<select name="status"><option value="">{translate('de', 'admin.all')}</option>
				{#each statuses as status}<option value={status} selected={data.query.status === status}>{translate('de', `messages.status.${status}` as 'messages.status.closed')}</option>{/each}
			</select>
		</label>
		<label>{translate('de', 'messages.category')}
			<select name="kind"><option value="">{translate('de', 'admin.all')}</option>
				{#each supportCategories as category}<option value={category} selected={data.query.kind === category}>{translate('de', `messages.category.${category}` as 'messages.category.other')}</option>{/each}
			</select>
		</label>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.threads.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.threads as thread}
			<article class="admin-card">
				<p class="item-kicker">{translate('de', `messages.category.${thread.category}` as 'messages.category.other')} · {translate('de', `messages.status.${thread.status}` as 'messages.status.closed')}</p>
				<h2>{thread.subject}</h2>
				<p>{thread.updatedAt} · {thread.messageCount}</p>
				<a href={`/admin/messages/${thread.publicReference}`}>{translate('de', 'messages.open')}</a>
			</article>
		{/each}
	</div>
</section>
