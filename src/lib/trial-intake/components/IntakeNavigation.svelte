<script lang="ts">
	import { page } from '$app/state';
	import { t } from '../i18n';
	let { admin = false }: { admin?: boolean } = $props();
	const locale = $derived(page.data.locale ?? page.error?.locale ?? 'de');
	const navigation = $derived(page.data.portalNavigation);
</script>

<nav class="auth-nav" aria-label={t(locale, 'adminTitle')}>
	{#if admin}
		<a href="/admin/trial-intake">{t(locale, 'adminTitle')}</a>
		<a href="/admin/outbox">{t(locale, 'outbox')}</a>
		<a href="/admin/operations">{t(locale, 'operations')}</a>
	{:else}
		<a href="/probestunde">{t(locale, 'title')}</a>
		{#if navigation?.role === 'admin'}<a href="/admin/trial-intake">{t(locale, 'adminTitle')}</a
			>
			<form method="POST" action="/account/security?/logout">
				<input type="hidden" name="_csrf" value={navigation.csrfToken} /><button
					class="nav-logout"
					type="submit">{t(locale, 'logout')}</button
				>
			</form>
		{:else}<a href="/auth/login">{t(locale, 'login')}</a>{/if}
	{/if}
</nav>
