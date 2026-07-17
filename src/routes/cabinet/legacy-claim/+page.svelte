<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'cabinet.claim.confirmTitle')}</title></svelte:head>
<main class="auth-shell">
	<h1>{translate('de', 'cabinet.claim.confirmTitle')}</h1>
	<p>{translate('de', 'cabinet.claim.confirmText')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form method="POST">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input type="hidden" name="token" value={data.token} />
		<button type="submit" disabled={!data.token}
			>{translate('de', 'cabinet.claim.confirm')}</button
		>
	</form>
</main>
