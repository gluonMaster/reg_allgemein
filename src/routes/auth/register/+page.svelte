<script lang="ts">
	import { tick } from 'svelte';
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let firstNameInput: HTMLInputElement;
	let lastNameInput: HTMLInputElement;
	let emailInput: HTMLInputElement;
	let passwordInput: HTMLInputElement;
	let privacyInput: HTMLInputElement;
	let firstName = $derived(form?.values?.firstName ?? '');
	let lastName = $derived(form?.values?.lastName ?? '');
	let email = $derived(form?.values?.email ?? '');
	let privacyAccepted = $derived(form?.values?.privacyAccepted ?? false);
	let turnstileReady = $state(false);
	let turnstileFailed = $state(false);
	const invalidFields = $derived<readonly string[]>(form?.invalidFields ?? []);
	const firstNameInvalid = $derived(invalidFields.includes('firstName'));
	const lastNameInvalid = $derived(invalidFields.includes('lastName'));
	const emailInvalid = $derived(invalidFields.includes('email'));
	const passwordInvalid = $derived(invalidFields.includes('password'));
	const privacyInvalid = $derived(
		invalidFields.includes('privacyAccepted') || invalidFields.includes('privacyNoticeVersion')
	);

	$effect(() => {
		const invalidTarget = firstNameInvalid
			? firstNameInput
			: lastNameInvalid
				? lastNameInput
				: emailInvalid
					? emailInput
					: passwordInvalid
						? passwordInput
						: privacyInvalid
							? privacyInput
							: undefined;
		if (invalidTarget) void tick().then(() => invalidTarget.focus());
	});
</script>

<svelte:head>
	<title>{translate('de', 'auth.register.title')}</title>
</svelte:head>

<main class="auth-shell">
	<AuthNav />
	<h1>{translate('de', 'auth.register.title')}</h1>
	{#if !data.authEnabled}
		<p class="form-status">{translate('de', 'auth.serviceUnavailable')}</p>
	{/if}
	<form method="POST">
		{#if form?.message}<p
				id="registration-error"
				class="form-status"
				role="alert"
				aria-live="assertive"
				aria-atomic="true"
			>
				{form.message}
			</p>{/if}
		<label for="firstName">{translate('de', 'auth.firstNameLabel')}</label>
		<input
			bind:this={firstNameInput}
			id="firstName"
			name="firstName"
			autocomplete="given-name"
			required
			maxlength="100"
			bind:value={firstName}
			aria-invalid={firstNameInvalid ? 'true' : undefined}
			aria-describedby={firstNameInvalid ? 'registration-error' : undefined}
		/>
		<label for="lastName">{translate('de', 'auth.lastNameLabel')}</label>
		<input
			bind:this={lastNameInput}
			id="lastName"
			name="lastName"
			autocomplete="family-name"
			required
			maxlength="100"
			bind:value={lastName}
			aria-invalid={lastNameInvalid ? 'true' : undefined}
			aria-describedby={lastNameInvalid ? 'registration-error' : undefined}
		/>
		<label for="email">{translate('de', 'auth.emailLabel')}</label>
		<input
			bind:this={emailInput}
			id="email"
			name="email"
			type="email"
			autocomplete="email"
			required
			maxlength="254"
			bind:value={email}
			aria-invalid={emailInvalid ? 'true' : undefined}
			aria-describedby={emailInvalid ? 'registration-error' : undefined}
		/>
		<label for="password">{translate('de', 'auth.passwordLabel')}</label>
		<input
			id="password"
			bind:this={passwordInput}
			name="password"
			type="password"
			autocomplete="new-password"
			required
			maxlength="128"
			aria-invalid={passwordInvalid ? 'true' : undefined}
			aria-describedby={passwordInvalid ? 'registration-error' : undefined}
		/>
		<label class="checkbox" for="privacyAccepted">
			<input
				bind:this={privacyInput}
				id="privacyAccepted"
				name="privacyAccepted"
				type="checkbox"
				required
				bind:checked={privacyAccepted}
				aria-invalid={privacyInvalid ? 'true' : undefined}
				aria-describedby={privacyInvalid ? 'registration-error' : undefined}
			/>
			<span>{translate('de', 'auth.privacyAcceptance')}</span>
		</label>
		<input
			type="hidden"
			name="privacyNoticeVersion"
			value={form?.privacyNoticeVersion ?? data.privacyNoticeVersion}
		/>
		{#if data.authEnabled && data.turnstileSiteKey}
			<TurnstileWidget
				siteKey={data.turnstileSiteKey}
				action="registration"
				bind:ready={turnstileReady}
				bind:failed={turnstileFailed}
			/>
			{#if turnstileFailed}<p class="form-status" role="alert">
					{translate('de', 'auth.turnstileUnavailable')}
				</p>{/if}
		{/if}
		<button
			type="submit"
			disabled={!data.authEnabled || !data.turnstileSiteKey || !turnstileReady}
			>{translate('de', 'auth.register.submit')}</button
		>
	</form>
</main>
