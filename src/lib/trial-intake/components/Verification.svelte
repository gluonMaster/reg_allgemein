<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { t, errorKey, type TextKey } from '../i18n';
	import type { VerificationState } from '../contracts';
	import { requestJson } from '../client';
	import '../intake.css';
	let { data }: { data: { verification: { state: VerificationState }; scheduleUrl: string } } =
		$props();
	const locale = $derived(page.data.locale ?? 'de');
	let accepted = $state(false),
		pending = $state(false),
		feedback = $state<TextKey | null>(null),
		enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	const viewState = $derived(accepted ? 'accepted' : data.verification.state);
	let initialAccepted = untrack(() => data.verification.state === 'accepted');
	async function confirm() {
		if (pending) return;
		pending = true;
		feedback = null;
		try {
			await requestJson('/probestunde/verify', {
				token: page.url.searchParams.get('token') ?? '',
			});
			accepted = true;
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head><title>{t(locale, 'confirmTitle')} · {ORGANIZATION_NAME}</title></svelte:head>
<main class="intake intake-shell">
	<h1>{t(locale, viewState === 'accepted' ? 'successTitle' : 'confirmTitle')}</h1>
	<section class="card highlight" aria-live="polite">
		{#if viewState === 'accepted'}<p>{t(locale, initialAccepted ? 'already' : 'success')}</p>
		{:else if viewState === 'confirm'}<p>{t(locale, 'confirmHint')}</p>
			<button class="primary" type="button" disabled={pending || !enhanced} onclick={confirm}
				>{t(locale, pending ? 'busy' : 'confirmTitle')}</button
			>
		{:else}<p>{t(locale, viewState)}</p>
			<a href="/probestunde">{t(locale, 'newRequest')}</a>{/if}
		{#if feedback}<p role="alert" class="error">{t(locale, feedback)}</p>{/if}
	</section>
	<a href={data.scheduleUrl}>{t(locale, 'back')}</a>
</main>
