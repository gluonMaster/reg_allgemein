<script lang="ts">
	import '../app.css';
	import { translate } from '$lib/i18n';

	const title = translate('de', 'home.title');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<main class="shell">
	<h1>{title}</h1>
	<p>{translate('de', 'home.foundationNotice')}</p>
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
