<script lang="ts">
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { dayLabel, errorKey, fill, t, type TextKey } from '../i18n';
	import type { WithdrawalData } from '../contracts';
	import { ORGANIZATION_PHONE } from '../organization';
	import { requestJson } from '../client';
	import '../intake.css';
	// WL-12: GET only shows the course and one button; the POST withdraws. No family data here.
	let { data }: { data: WithdrawalData } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	let view = $state(untrack(() => data.state)),
		pending = $state(false),
		enhanced = $state(false),
		feedback = $state<TextKey | null>(null);
	onMount(() => {
		enhanced = true;
	});
	async function withdraw() {
		if (pending) return;
		pending = true;
		feedback = null;
		try {
			await requestJson('/warteliste/austragen', {
				token: page.url.searchParams.get('token') ?? '',
			});
			view = 'withdrawn';
		} catch (e) {
			const code = e instanceof Error ? e.message : '';
			if (code === 'WAITLIST_COURSE_STARTED') view = 'started';
			else if (code === 'WAITLIST_WITHDRAW_INVALID') view = 'invalid';
			else feedback = errorKey(code);
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head><title>{t(locale, 'withdrawTitle')} · {ORGANIZATION_NAME}</title></svelte:head>
<main class="intake intake-shell">
	<h1>{t(locale, 'withdrawTitle')}</h1>
	<section class="card highlight" aria-live="polite">
		{#if data.course && view !== 'invalid'}<div class="intake-lesson">
				<strong>{data.course.subject}</strong><span>{t(locale, 'plannedLabel')}</span>
				<p>
					{dayLabel(data.course.weekday, locale)} · {data.course.start}–{data.course.end}
				</p>
				<p>{data.course.building} · {t(locale, 'room')} {data.course.room}</p>
			</div>{/if}
		{#if view === 'confirm' && data.course}
			<p>{fill(t(locale, 'withdrawQuestion'), { subject: data.course.subject })}</p>
			<button class="primary" type="button" disabled={pending || !enhanced} onclick={withdraw}
				>{t(locale, pending ? 'busy' : 'withdrawButton')}</button
			>
		{:else if view === 'withdrawn'}<p role="status">{t(locale, 'withdrawDone')}</p>
		{:else if view === 'started'}<p>
				{fill(t(locale, 'withdrawStarted'), { phone: ORGANIZATION_PHONE })}
			</p>
		{:else}<p>{t(locale, 'withdrawInvalid')}</p>{/if}
		{#if feedback}<p role="alert" class="error">{t(locale, feedback)}</p>{/if}
	</section>
	<a href={data.scheduleUrl}>{t(locale, 'back')}</a>
</main>
