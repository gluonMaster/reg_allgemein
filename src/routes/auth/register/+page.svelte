<script lang="ts">
	import '../../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>{translate('de', 'auth.register.title')}</title>
	{#if data.authEnabled && data.turnstileSiteKey}
		<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
	{/if}
</svelte:head>

<main class="auth-shell">
	<AuthNav />
	<h1>{translate('de', 'auth.register.title')}</h1>
	{#if !data.authEnabled}
		<p class="form-status">{translate('de', 'auth.serviceUnavailable')}</p>
	{/if}
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form method="POST">
		<label for="firstName">{translate('de', 'auth.firstNameLabel')}</label>
		<input id="firstName" name="firstName" autocomplete="given-name" required maxlength="100" />
		<label for="lastName">{translate('de', 'auth.lastNameLabel')}</label>
		<input id="lastName" name="lastName" autocomplete="family-name" required maxlength="100" />
		<label for="email">{translate('de', 'auth.emailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<label for="password">{translate('de', 'auth.passwordLabel')}</label>
		<input
			id="password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
			maxlength="128"
		/>
		<label class="checkbox" for="privacyAccepted">
			<input id="privacyAccepted" name="privacyAccepted" type="checkbox" required />
			<span>{translate('de', 'auth.privacyAcceptance')}</span>
		</label>
		<input type="hidden" name="privacyNoticeVersion" value={data.privacyNoticeVersion} />
		{#if data.authEnabled && data.turnstileSiteKey}
			<div
				class="cf-turnstile"
				data-sitekey={data.turnstileSiteKey}
				data-action="registration"
			></div>
		{/if}
		<button type="submit" disabled={!data.authEnabled}
			>{translate('de', 'auth.register.submit')}</button
		>
	</form>
</main>
