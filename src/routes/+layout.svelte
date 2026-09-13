<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../app.css';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<meta name="description" content={translate(uiLocale, 'meta.description')} />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

<LanguageSwitcher />
{@render children()}

{#if data.officialLinks}
	<footer class="site-footer" data-links-version={data.officialLinks.version}>
		<nav aria-label={translate(uiLocale, 'footer.navigationLabel')}>
			<a href={data.officialLinks.privacyUrl}>{translate(uiLocale, 'footer.privacy')}</a>
			<a href={data.officialLinks.imprintUrl}>{translate(uiLocale, 'footer.imprint')}</a>
			<a href={data.officialLinks.contactUrl}>{translate(uiLocale, 'footer.contact')}</a>
		</nav>
	</footer>
{/if}
