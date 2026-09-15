<script lang="ts">
	import AuthHelp from '$lib/components/AuthHelp.svelte';
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'auth.resend.title')}</title></svelte:head>
<main class="auth-shell">
	<h1>{translate(uiLocale, 'auth.resend.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form method="POST">
		<label for="email">{translate(uiLocale, 'auth.emailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<button type="submit">{translate(uiLocale, 'auth.resend.submit')}</button>
	</form>
	<AuthHelp />
</main>
