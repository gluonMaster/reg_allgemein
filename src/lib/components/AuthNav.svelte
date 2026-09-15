<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const locale = $derived(page.error?.locale ?? page.data.locale ?? 'de');
	const navigation = $derived(page.data.portalNavigation);
	const role = $derived(
		page.error?.accessRole !== undefined ? page.error.accessRole : navigation?.role
	);
	const home = $derived(role === 'admin' ? '/admin' : '/cabinet');
	const current = (href: string) =>
		navigation?.pathname === href ? ('page' as const) : undefined;
</script>

<nav class="auth-nav" aria-label={translate(locale, 'ui.nav.label')}>
	<a href="/catalog" aria-current={current('/catalog')}>{translate(locale, 'ui.nav.catalog')}</a>
	{#if role}
		<a href={home} aria-current={current(home)}
			>{translate(locale, role === 'admin' ? 'ui.nav.admin' : 'ui.nav.parent')}</a
		>
		{#if role === 'parent'}<a href="/messages" aria-current={current('/messages')}
				>{translate(locale, 'ui.nav.messages')}</a
			>{/if}
		<a href="/account/security" aria-current={current('/account/security')}
			>{translate(locale, 'ui.nav.settings')}</a
		>
		<span class="session-role"
			>{translate(
				locale,
				role === 'admin' ? 'ui.nav.role.admin' : 'ui.nav.role.parent'
			)}</span
		>
		{#if !page.error && navigation?.csrfToken}
			<form method="POST" action="/account/security?/logout">
				<input type="hidden" name="_csrf" value={navigation.csrfToken} />
				<button type="submit" class="nav-logout"
					>{translate(locale, 'auth.logout.submit')}</button
				>
			</form>
		{/if}
	{:else}
		<a href="/auth/login" aria-current={current('/auth/login')}
			>{translate(locale, 'auth.link.login')}</a
		>
		<a href="/auth/register" aria-current={current('/auth/register')}
			>{translate(locale, 'auth.link.register')}</a
		>
	{/if}
</nav>
