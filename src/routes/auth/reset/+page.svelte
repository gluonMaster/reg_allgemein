<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'auth.reset.title')}</title></svelte:head>
<main class="auth-shell">
	<AuthNav />
	<h1>{translate(uiLocale, 'auth.reset.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form method="POST">
		<input type="hidden" name="token" value={data.token} />
		<label for="password">{translate(uiLocale, 'auth.passwordLabel')}</label>
		<input id="password" name="password" type="password" autocomplete="new-password" required maxlength="128" />
		<button type="submit" disabled={!data.token}>{translate(uiLocale, 'auth.reset.submit')}</button>
	</form>
</main>
