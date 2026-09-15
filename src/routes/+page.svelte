<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const locale = $derived(page.data.locale ?? 'de');
	const role = $derived(page.data.portalNavigation?.role);
</script>

<svelte:head><title>{translate(locale, 'home.title')}</title></svelte:head>
<main class="home-shell">
	<section class="home-intro">
		<h1>{translate(locale, 'home.title')}</h1>
		<p>{translate(locale, 'ui.home.intro')}</p>
		<div class="home-actions">
			<a class="catalog-cta" href="/catalog">{translate(locale, 'home.catalogLink')}</a>
			{#if role}
				<a class="secondary-cta" href={role === 'admin' ? '/admin' : '/cabinet'}
					>{translate(locale, role === 'admin' ? 'ui.nav.admin' : 'ui.nav.parent')}</a
				>
			{:else}
				<a class="secondary-cta" href="/auth/login"
					>{translate(locale, 'auth.link.login')}</a
				>
			{/if}
		</div>
	</section>
</main>
