<script lang="ts">
	import { page } from '$app/state';
	import { t } from '../i18n';
	const locale = $derived(page.data.locale ?? page.error?.locale ?? 'de');
</script>

<a class="office-login" href="/auth/login">{t(locale, 'login')}</a>
