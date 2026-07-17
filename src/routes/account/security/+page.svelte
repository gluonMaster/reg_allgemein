<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'auth.security.title')}</title></svelte:head>
<main class="auth-shell">
	<nav class="auth-nav" aria-label={translate('de', 'cabinet.navigationLabel')}>
		<a href="/cabinet">{translate('de', 'cabinet.link.cabinet')}</a>
	</nav>
	<h1>{translate('de', 'auth.security.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form method="POST" action="?/changeEmail">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<label for="email">{translate('de', 'auth.security.newEmailLabel')}</label>
		<input id="email" name="email" type="email" autocomplete="email" required maxlength="254" />
		<button type="submit">{translate('de', 'auth.security.changeEmailSubmit')}</button>
	</form>
	<form method="POST" action="?/revokeSessions">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<button type="submit" class="secondary">{translate('de', 'auth.security.revokeSessionsSubmit')}</button>
	</form>
	<form method="POST" action="?/logout">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<button type="submit" class="secondary">{translate('de', 'auth.logout.submit')}</button>
	</form>
</main>
