<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let viewportWidth = $state(0);
	const isCurrent = (href: string) =>
		portalPage.url.pathname === href ||
		(href !== '/admin' && portalPage.url.pathname.startsWith(`${href}/`));
	const groups = $derived(
		[
			{
				label: 'admin.group.families' as const,
				ids: ['users', 'legacy', 'reviews', 'messages', 'privacy'],
			},
			{
				label: 'admin.group.courses' as const,
				ids: ['catalog', 'trials', 'requests', 'contracts', 'price-reviews', 'pricing'],
			},
			{
				label: 'admin.group.system' as const,
				ids: ['imports', 'import-reconciliation', 'outbox', 'operations'],
			},
		].map((group) => ({
			...group,
			items: data.navigation.filter((item) => group.ids.includes(item.id)),
		}))
	);
</script>

<svelte:window bind:innerWidth={viewportWidth} />
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
		{#each data.navigation.filter((item) => !groups.some( (group) => group.ids.includes(item.id) )) as item}
			<a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}
				>{translate(uiLocale, item.labelKey)}</a
			>
		{/each}
		{#each groups as group}
			<details
				class="admin-nav-group"
				open={viewportWidth >= 768 || group.items.some((item) => isCurrent(item.href))}
			>
				<summary>{translate(uiLocale, group.label)}</summary>
				<div>
					{#each group.items as item}
						<a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}
							>{translate(uiLocale, item.labelKey)}</a
						>
					{/each}
				</div>
			</details>
		{/each}
	</nav>
	{@render children()}
</main>
