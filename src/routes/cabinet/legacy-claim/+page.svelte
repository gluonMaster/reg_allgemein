<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'cabinet.claim.confirmTitle')}</title></svelte:head>
<main class="auth-shell">
	<h1>{translate(uiLocale, 'cabinet.claim.confirmTitle')}</h1>
	<p>{translate(uiLocale, 'cabinet.claim.confirmText')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form method="POST">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="token" value={data.token} />
		<button type="submit" disabled={!data.token}
			>{translate(uiLocale, 'cabinet.claim.confirm')}</button
		>
	</form>
</main>
