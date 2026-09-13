<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const locale = $derived(page.data.locale ?? page.error?.locale ?? 'de');
</script>

<svelte:head><title>{translate(locale, 'ui.error.title')}</title></svelte:head>
<main class="auth-shell">
	<h1>{page.status} · {translate(locale, 'ui.error.title')}</h1>
	<p role="alert">{page.error?.message ?? translate(locale, 'errors.unexpected')}</p>
	{#if page.error?.requestId}<p>
			{translate(locale, 'ui.error.reference')}: <code>{page.error.requestId}</code>
		</p>{/if}
	<a href="/">{translate(locale, 'ui.error.home')}</a>
</main>
