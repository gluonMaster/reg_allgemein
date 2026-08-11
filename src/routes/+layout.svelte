<script lang="ts">
	import '../app.css';
	import { translate } from '$lib/i18n';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<svelte:head>
	<meta name="description" content={translate('de', 'meta.description')} />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</svelte:head>

{@render children()}

{#if data.officialLinks}
	<footer class="site-footer" data-links-version={data.officialLinks.version}>
		<nav aria-label={translate('de', 'footer.navigationLabel')}>
			<a href={data.officialLinks.privacyUrl}>{translate('de', 'footer.privacy')}</a>
			<a href={data.officialLinks.imprintUrl}>{translate('de', 'footer.imprint')}</a>
			<a href={data.officialLinks.contactUrl}>{translate('de', 'footer.contact')}</a>
		</nav>
	</footer>
{/if}
