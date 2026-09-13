<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'auth.security.title')}</title></svelte:head>
<main class="auth-shell">
	<nav
		class="auth-nav"
		aria-label={translate(uiLocale,
			data.role === 'admin' ? 'admin.navigationLabel' : 'cabinet.navigationLabel'
		)}
	>
		<a href={data.homeHref}>{translate(uiLocale,
			data.role === 'admin' ? 'admin.title' : 'cabinet.link.cabinet'
		)}</a>
	</nav>
	<h1>{translate(uiLocale, 'auth.security.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form method="POST" action="?/changeEmail">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<label for="email">{translate(uiLocale, 'auth.security.newEmailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<button type="submit">{translate(uiLocale, 'auth.security.changeEmailSubmit')}</button>
	</form>
	<form method="POST" action="?/revokeSessions">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<button type="submit" class="secondary">{translate(uiLocale, 'auth.security.revokeSessionsSubmit')}</button>
	</form>
	<form method="POST" action="?/logout">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<button type="submit" class="secondary">{translate(uiLocale, 'auth.logout.submit')}</button>
	</form>
</main>
