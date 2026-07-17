<script lang="ts">
	import { translate } from '$lib/i18n';
</script>

<nav class="auth-nav" aria-label={translate('de', 'auth.navigationLabel')}>
	<a href="/auth/register">{translate('de', 'auth.link.register')}</a>
	<a href="/auth/login">{translate('de', 'auth.link.login')}</a>
	<a href="/auth/forgot">{translate('de', 'auth.link.forgot')}</a>
	<a href="/auth/resend">{translate('de', 'auth.link.resend')}</a>
</nav>
