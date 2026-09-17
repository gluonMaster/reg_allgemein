<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.error?.locale ?? portalPage.data.locale ?? 'de');
	import '../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import IntakeNavigation from '$lib/trial-intake/components/IntakeNavigation.svelte';
	import OfficeLoginLink from '$lib/trial-intake/components/OfficeLoginLink.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	// Visitors come here to request a trial, so the office entrance sits in the footer.
	const officeLogin = $derived(
		data.portalMode === 'trial_intake' && data.portalNavigation?.role !== 'admin'
	);
</script>

<svelte:head>
	<meta name="description" content={translate(uiLocale, 'meta.description')} />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

<header class="site-header">
	<div class="brand-row">
		<a
			class="site-brand"
			href="/"
			aria-label={`${ORGANIZATION_NAME} · ${translate(uiLocale, 'home.title')}`}
			>{ORGANIZATION_NAME}<span>{translate(uiLocale, 'home.title')}</span></a
		>
		<LanguageSwitcher />
	</div>
	{#if data.portalMode === 'trial_intake'}<IntakeNavigation />{:else}<AuthNav />{/if}
</header>
{@render children()}

{#if data.officialLinks || officeLogin}
	<footer class="site-footer" data-links-version={data.officialLinks?.version}>
		<nav aria-label={translate(uiLocale, 'footer.navigationLabel')}>
			{#if data.officialLinks}
				<a href={data.officialLinks.privacyUrl}>{translate(uiLocale, 'footer.privacy')}</a>
				<a href={data.officialLinks.imprintUrl}>{translate(uiLocale, 'footer.imprint')}</a>
				<a href={data.officialLinks.contactUrl}>{translate(uiLocale, 'footer.contact')}</a>
			{/if}
			{#if officeLogin}<OfficeLoginLink />{/if}
		</nav>
	</footer>
{/if}
