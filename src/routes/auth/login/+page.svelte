<script lang="ts">
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'auth.login.title')}</title></svelte:head>
<main class="auth-shell">
	<AuthNav />
	<h1>{translate('de', 'auth.login.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form method="POST">
		<label for="email">{translate('de', 'auth.emailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<label for="password">{translate('de', 'auth.passwordLabel')}</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required maxlength="128" />
		<button type="submit">{translate('de', 'auth.login.submit')}</button>
	</form>
</main>
