<script lang="ts">
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'auth.forgot.title')}</title></svelte:head>
<main class="auth-shell">
	<AuthNav />
	<h1>{translate('de', 'auth.forgot.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form method="POST">
		<label for="email">{translate('de', 'auth.emailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<button type="submit">{translate('de', 'auth.forgot.submit')}</button>
	</form>
</main>
