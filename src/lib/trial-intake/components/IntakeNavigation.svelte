<script lang="ts">
	import { page } from '$app/state';
	import { t } from '../i18n';
	let { admin = false }: { admin?: boolean } = $props();
	const locale = $derived(page.data.locale ?? page.error?.locale ?? 'de');
	const navigation = $derived(page.data.portalNavigation);
	const signedIn = $derived(navigation?.role === 'admin');
	// The form is the portal's entry point: neither its own visitors nor the office
	// need a link back to it, so the header only offers what leads somewhere else.
	const intakeLink = $derived(!signedIn && navigation?.pathname !== '/probestunde');
	const consoleLink = $derived(signedIn && !navigation?.pathname?.startsWith('/admin'));
</script>

{#if admin || intakeLink || signedIn}
	<nav class="auth-nav" aria-label={t(locale, 'adminTitle')}>
		{#if admin}
			<a href="/admin/trial-intake">{t(locale, 'adminTitle')}</a>
			<a href="/admin/trial-intake/groups">{t(locale, 'adminGroups')}</a>
			<a href="/admin/outbox">{t(locale, 'outbox')}</a>
			<a href="/admin/operations">{t(locale, 'operations')}</a>
		{:else}
			{#if intakeLink}<a href="/probestunde">{t(locale, 'title')}</a>{/if}
			{#if consoleLink}<a href="/admin/trial-intake">{t(locale, 'adminTitle')}</a>{/if}
			{#if signedIn}
				<form method="POST" action="/account/security?/logout">
					<input type="hidden" name="_csrf" value={navigation.csrfToken} /><button
						class="nav-logout"
						type="submit">{t(locale, 'logout')}</button
					>
				</form>
			{/if}
		{/if}
	</nav>
{/if}
