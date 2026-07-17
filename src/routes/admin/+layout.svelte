<script lang="ts">
	import '../../app.css';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head><title>{translate('de', 'admin.title')}</title></svelte:head>

<main class="admin-shell">
	<header class="admin-header">
		<div>
			<p class="item-kicker">{translate('de', 'admin.kicker')}</p>
			<h1>{translate('de', 'admin.title')}</h1>
		</div>
		<a href="/account/security">{translate('de', 'admin.accountSecurity')}</a>
	</header>
	<nav class="admin-nav" aria-label={translate('de', 'admin.navigationLabel')}>
		{#each data.navigation as item}
			<a href={item.href}>{translate('de', item.labelKey)}</a>
		{/each}
	</nav>
	{@render children()}
</main>
