<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'admin.title')}</title></svelte:head>

<main class="admin-shell">
	<header class="admin-header">
		<div>
			<p class="item-kicker">{translate(uiLocale, 'admin.kicker')}</p>
			<h1>{translate(uiLocale, 'admin.title')}</h1>
		</div>
		<a href="/account/security">{translate(uiLocale, 'admin.accountSecurity')}</a>
	</header>
	<nav class="admin-nav" aria-label={translate(uiLocale, 'admin.navigationLabel')}>
		{#each data.navigation as item}
			<a href={item.href}>{translate(uiLocale, item.labelKey)}</a>
		{/each}
	</nav>
	{@render children()}
</main>
