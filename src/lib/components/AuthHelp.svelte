<script lang="ts">
	import { page } from '$app/state';
	import { translate } from '$lib/i18n';
	const locale = $derived(page.data.locale ?? 'de');
</script>

<nav class="auth-help" aria-label={translate(locale, 'auth.navigationLabel')}>
	<a href="/auth/forgot">{translate(locale, 'auth.link.forgot')}</a>
	<a href="/auth/resend">{translate(locale, 'auth.link.resend')}</a>
</nav>
