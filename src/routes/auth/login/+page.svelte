<script lang="ts">
	import { tick } from 'svelte';
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let emailInput: HTMLInputElement;
	let passwordInput: HTMLInputElement;
	const emailInvalid = $derived(form?.invalidFields?.includes('email') ?? false);
	const passwordInvalid = $derived(form?.invalidFields?.includes('password') ?? false);

	$effect(() => {
		const invalidTarget = emailInvalid
			? emailInput
			: passwordInvalid
				? passwordInput
				: undefined;
		if (invalidTarget) void tick().then(() => invalidTarget.focus());
	});
</script>

<svelte:head><title>{translate('de', 'auth.login.title')}</title></svelte:head>
<main class="auth-shell">
	<AuthNav />
	<h1>{translate('de', 'auth.login.title')}</h1>
	<form method="POST">
		{#if form?.message}<p
				id="login-error"
				class="form-status"
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
			>
				{form.message}
			</p>{/if}
		<label for="email">{translate('de', 'auth.emailLabel')}</label>
		<input
			bind:this={emailInput}
			id="email"
			name="email"
			type="email"
			autocomplete="email"
			required
			maxlength="254"
			aria-invalid={emailInvalid ? 'true' : undefined}
			aria-describedby={emailInvalid ? 'login-error' : undefined}
			aria-errormessage={emailInvalid ? 'login-error' : undefined}
		/>
		<label for="password">{translate('de', 'auth.passwordLabel')}</label>
		<input
			bind:this={passwordInput}
			id="password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
			maxlength="128"
			aria-invalid={passwordInvalid ? 'true' : undefined}
			aria-describedby={passwordInvalid ? 'login-error' : undefined}
			aria-errormessage={passwordInvalid ? 'login-error' : undefined}
		/>
		<button type="submit">{translate('de', 'auth.login.submit')}</button>
	</form>
</main>
