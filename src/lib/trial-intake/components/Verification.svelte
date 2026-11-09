<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { t, errorKey, fill, formatDate, type TextKey } from '../i18n';
	import type { VerificationResult } from '../contracts';
	import { ORGANIZATION_PHONE } from '../organization';
	import { requestJson } from '../client';
	import '../intake.css';
	let { data }: { data: { verification: VerificationResult; scheduleUrl: string } } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	let result = $state<VerificationResult | null>(null),
		pending = $state(false),
		feedback = $state<TextKey | null>(null),
		enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	const view = $derived(result ?? data.verification);
	// A waitlist signup shows its own texts; the trial request keeps its wording.
	const waitlist = $derived(data.verification.kind === 'waitlist');
	let initialAccepted = untrack(() => data.verification.state === 'accepted');
	const confirmTitle = $derived(t(locale, waitlist ? 'waitlistConfirmTitle' : 'confirmTitle'));
	const title = $derived(
		view.state === 'accepted'
			? t(locale, waitlist ? 'waitlistHeading' : 'successTitle')
			: view.state === 'cancelled'
				? t(locale, 'waitlistHeading')
				: confirmTitle
	);
	async function confirm() {
		if (pending) return;
		pending = true;
		feedback = null;
		try {
			result = await requestJson<VerificationResult>('/probestunde/verify', {
				token: page.url.searchParams.get('token') ?? '',
			});
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head><title>{confirmTitle} · {ORGANIZATION_NAME}</title></svelte:head>
<main class="intake intake-shell">
	<h1>{title}</h1>
	<section class="card highlight" aria-live="polite">
		{#if view.state === 'accepted'}<p>
				{t(
					locale,
					initialAccepted && !result
						? 'already'
						: waitlist
							? 'waitlistConfirmed'
							: 'success'
				)}
			</p>
		{:else if view.state === 'cancelled'}<p>
				{view.firstDate
					? fill(t(locale, 'waitlistStarted'), {
							date: formatDate(view.firstDate, locale),
							phone: ORGANIZATION_PHONE,
						})
					: fill(t(locale, 'waitlistChanged'), { phone: ORGANIZATION_PHONE })}
			</p>
		{:else if view.state === 'confirm'}<p>
				{t(locale, waitlist ? 'waitlistConfirmHint' : 'confirmHint')}
			</p>
			<button class="primary" type="button" disabled={pending || !enhanced} onclick={confirm}
				>{pending ? t(locale, 'busy') : confirmTitle}</button
			>
		{:else}<p>{t(locale, view.state)}</p>
			{#if !waitlist}<a href="/probestunde">{t(locale, 'newRequest')}</a>{/if}{/if}
		{#if feedback}<p role="alert" class="error">{t(locale, feedback)}</p>{/if}
	</section>
	<a href={data.scheduleUrl}>{t(locale, 'back')}</a>
</main>
