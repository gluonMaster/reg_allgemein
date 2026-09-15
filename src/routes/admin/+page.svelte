<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const cards = $derived([
		{
			label: 'admin.dashboard.openReviews',
			value: data.dashboard.openReviews,
			href: '/admin/reviews',
		},
		{
			label: 'admin.dashboard.openIssues',
			value: data.dashboard.openImportIssues,
			href: '/admin/imports',
		},
		{
			label: 'admin.dashboard.blockedUsers',
			value: data.dashboard.blockedUsers,
			href: null,
		},
		{
			label: 'admin.dashboard.catalogReview',
			value: data.dashboard.catalogNeedsReview,
			href: '/admin/catalog?status=needs_review',
		},
	] as const);
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.nav.dashboard')}</h2>
	<h3>{translate(uiLocale, 'admin.dashboard.quickActions')}</h3>
	<div class="admin-quick-links">
		{#each data.navigation.filter( (item) => ['trials', 'requests', 'contracts', 'messages', 'catalog'].includes(item.id) ) as item}
			<a class="secondary-cta" href={item.href}>{translate(uiLocale, item.labelKey)}</a>
		{/each}
	</div>
	<div class="admin-metrics">
		{#each cards as card}
			{#if card.href}
				<a class="metric-card" href={card.href}>
					<strong>{card.value}</strong>
					<span>{translate(uiLocale, card.label)}</span>
				</a>
			{:else}
				<div class="metric-card">
					<strong>{card.value}</strong>
					<span>{translate(uiLocale, card.label)}</span>
					<a href="/admin/users">{translate(uiLocale, 'admin.dashboard.allUsers')}</a>
				</div>
			{/if}
		{/each}
	</div>
</section>
