<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { requestJson } from '../client';
	import {
		t,
		attentionReasonsText,
		dayLabel,
		errorKey,
		fill,
		formatDate,
		startBlockText,
		type Locale,
	} from '../i18n';
	import type { WaitlistCourse, WaitlistStartOptions } from '../contracts';
	import LessonCard from './LessonCard.svelte';
	// WL-10: the start dialog of one planned course. Every check is repeated by the server.
	let {
		course,
		options,
		csrfToken,
		locale,
		onclose,
	}: {
		course: WaitlistCourse;
		options: WaitlistStartOptions;
		csrfToken: string;
		locale: Locale;
		onclose: () => void;
	} = $props();
	const lesson = $derived(course.lessons[0]);
	const families = $derived((course.entries ?? []).filter((e) => e.status === 'waiting'));
	const children = $derived(families.reduce((sum, family) => sum + family.children.length, 0));
	const unconfirmed = $derived(course.activeEntries - course.waitingFamilies);
	const id = $derived(`start-${lesson.id.slice(0, 12)}`);
	let firstDate = $state(''),
		family = $state(''),
		checked = $state(false),
		busy = $state(false),
		feedback = $state<string | null>(null),
		notice = $state<string | null>(null),
		letter = $state<{ subject: string; text: string } | null>(null),
		done = $state(false);
	async function post<T>(action: string, body: Record<string, unknown> = {}) {
		busy = true;
		feedback = null;
		try {
			return await requestJson<T>('/admin/trial-intake/warteliste/start', {
				action,
				lessonId: lesson.id,
				firstDate,
				...body,
				_csrf: csrfToken,
			});
		} catch (e) {
			feedback = t(locale, errorKey(e instanceof Error ? e.message : ''));
			return null;
		} finally {
			busy = false;
		}
	}
	async function preview() {
		if (!family || options.probe) return;
		letter = await post('preview', { requestId: family });
	}
	async function probe() {
		notice = null;
		if (await post('probe', { requestId: family })) notice = t(locale, 'startProbeSent');
	}
	async function start() {
		notice = null;
		if (await post('start', { checked: true })) {
			done = true;
			notice = t(locale, 'startDone');
			await invalidateAll();
		}
	}
	let heading = $state<HTMLHeadingElement>();
	onMount(() => {
		heading?.focus();
		firstDate = options.defaultDate;
		family = families[0]?.requestId ?? '';
		void preview();
	});
</script>

<section class="card start-dialog" aria-labelledby={id}>
	<h3 {id} tabindex="-1" bind:this={heading}>
		{fill(t(locale, 'startDialogTitle'), { subject: lesson.subject })}
	</h3>
	{#if !done}
		<p class="muted">{t(locale, 'startDialogIntro')}</p>
		<LessonCard {lesson} {locale} duration />
		<!-- WL-15: the orange mark does not block the start, the dialog reminds of it. -->
		{#if course.attention?.length}<p class="mark mark-orange">
				{fill(t(locale, 'startAttention'), {
					reasons: attentionReasonsText(course.attention, locale),
				})}
			</p>{/if}
		<label
			>{t(locale, 'startFirstDate')}<select
				value={firstDate}
				disabled={busy}
				onchange={(e) => {
					firstDate = e.currentTarget.value;
					void preview();
				}}
			>
				{#each options.dates as date (date)}<option value={date}
						>{dayLabel(lesson.weekday, locale)}, {formatDate(date, locale)}</option
					>{/each}
			</select></label
		>
		<p>{fill(t(locale, 'startRecipients'), { n: families.length, m: children })}</p>
		{#if families.length}<ul>
				{#each families as entry (entry.requestId)}<li>
						{entry.parentFirstName}
						{entry.parentLastName}: {entry.children
							.map((c) => `${c.firstName} ${c.lastName}`)
							.join(', ')}
					</li>{/each}
			</ul>{/if}
		{#if unconfirmed > 0}<p class="muted">
				{fill(t(locale, 'startUnconfirmed'), { n: unconfirmed })}
			</p>{/if}
		{#if options.probe}<p class="muted">
				{fill(t(locale, 'startBlocked'), { reason: startBlockText(options.probe, locale) })}
			</p>
		{:else}
			<label
				>{t(locale, 'startFamily')}<select
					value={family}
					disabled={busy}
					onchange={(e) => {
						family = e.currentTarget.value;
						void preview();
					}}
				>
					{#each families as entry (entry.requestId)}<option value={entry.requestId}
							>{entry.parentFirstName} {entry.parentLastName}</option
						>{/each}
				</select></label
			>
			<h4>{t(locale, 'startLetter')}</h4>
			{#if letter}<div class="letter-preview">
					<p><strong>{letter.subject}</strong></p>
					<p class="letter-text">{letter.text}</p>
				</div>{/if}
			<div class="actions">
				<button type="button" disabled={busy || !family} onclick={probe}
					>{t(locale, 'startProbe')}</button
				>
			</div>
		{/if}
		{#if options.start}<p class="muted">
				{fill(t(locale, 'startBlocked'), { reason: startBlockText(options.start, locale) })}
			</p>
		{:else}
			<p>{t(locale, 'startFinal')}</p>
			<label class="check"
				><input type="checkbox" bind:checked />{t(locale, 'startChecked')}</label
			>
			<div class="actions">
				<button class="primary" type="button" disabled={busy || !checked} onclick={start}
					>{t(locale, busy ? 'busy' : 'startConfirm')}</button
				>
			</div>
		{/if}
	{/if}
	{#if feedback}<p class="error" role="alert">{feedback}</p>{/if}
	{#if notice}<p class="highlight" role="status">{notice}</p>{/if}
	<div class="actions">
		<button type="button" onclick={onclose}>{t(locale, 'closeDialog')}</button>
	</div>
</section>
