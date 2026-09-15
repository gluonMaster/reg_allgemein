<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const role = $derived(page.error?.accessRole ?? page.data.portalNavigation?.role);
	const locale = $derived(page.error?.locale ?? page.data.locale ?? 'de');
</script>

<svelte:head><title>{translate(locale, 'ui.error.title')}</title></svelte:head>
<main class="auth-shell">
	<section class="error-card">
		<h1>{page.status} · {translate(locale, 'ui.error.title')}</h1>
		<p role="alert">{page.error?.message ?? translate(locale, 'errors.unexpected')}</p>
		{#if page.error?.requestId}<p>
				{translate(locale, 'ui.error.reference')}: <code>{page.error.requestId}</code>
			</p>{/if}
		<div class="home-actions">
			{#if page.status === 401}
				<a class="catalog-cta" href="/auth/login">{translate(locale, 'auth.link.login')}</a>
			{:else if role}
				<a class="catalog-cta" href={role === 'admin' ? '/admin' : '/cabinet'}
					>{translate(locale, role === 'admin' ? 'ui.nav.admin' : 'ui.nav.parent')}</a
				>
			{/if}
			<a href="/">{translate(locale, 'ui.error.home')}</a>
		</div>
	</section>
</main>
