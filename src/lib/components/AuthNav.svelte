<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate } from '$lib/i18n';
</script>

<nav class="auth-nav" aria-label={translate(uiLocale, 'auth.navigationLabel')}>
	<a href="/catalog">{translate(uiLocale, 'home.catalogLink')}</a>
	<a href="/auth/register">{translate(uiLocale, 'auth.link.register')}</a>
	<a href="/auth/login">{translate(uiLocale, 'auth.link.login')}</a>
	<a href="/auth/forgot">{translate(uiLocale, 'auth.link.forgot')}</a>
	<a href="/auth/resend">{translate(uiLocale, 'auth.link.resend')}</a>
</nav>
