<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';

	const title = $derived(translate(uiLocale, 'home.title'));
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="shell">
	<AuthNav />
	<h1>{title}</h1>
	<p>{translate(uiLocale, 'home.foundationNotice')}</p>
</main>

<style>
	.shell {
		max-width: 760px;
		margin: 0 auto;
		padding: 48px 20px;
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 16px;
	}

	p {
		font-size: 1rem;
		line-height: 1.6;
	}
</style>
