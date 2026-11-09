<script lang="ts">
	import { onMount } from 'svelte';
	import { formatEuro } from '$lib/i18n/locale';
	import { requestJson } from '../client';
	import { centsText } from '../prices';
	import {
		t,
		attentionReasonsText,
		dayLabel,
		differenceText,
		errorKey,
		fill,
		rebindBlockText,
		rebindKindText,
		type Locale,
	} from '../i18n';
	import type { CourseSummary, RebindOptions, RebindTarget, WaitlistCourse } from '../contracts';
	// WL-15: the rebind tool of a course that left the schedule. The server repeats every check.
	let {
		course,
		options,
		csrfToken,
		locale,
		ondone,
		onclose,
	}: {
		course: WaitlistCourse;
		options: RebindOptions;
		csrfToken: string;
		locale: Locale;
		ondone: (rebound: boolean) => void;
		onclose: () => void;
	} = $props();
	const id = $derived(`rebind-${course.key.length}-${course.course.start.replace(':', '')}`);
	let selected = $state(''),
		monthly = $state(''),
		yearly = $state(''),
		busy = $state(false),
		feedback = $state<string | null>(null);
	const target = $derived(options.targets.find((t) => t.key === selected && !t.block));
	// New sums: always for a price without a queue, for a queue only with a duration change.
	const sums = $derived(!!target && (!options.queue || target.comparison.kind === 'price'));
	const summary = (c: CourseSummary) =>
		`${c.subject}, ${dayLabel(c.weekday, locale)} ${c.start}–${c.end}, ${c.building} · ${t(locale, 'room')} ${c.room}, ${c.teacher}`;
	const amounts = (p: { monthlyCents: number; yearlyCents: number }) =>
		`${t(locale, 'tariffMonthly')} ${formatEuro(locale, p.monthlyCents)}, ${t(locale, 'tariffYearly')} ${formatEuro(locale, p.yearlyCents)}`;
	const decision = (target: RebindTarget) =>
		target.block
			? rebindBlockText(target.block, locale)
			: options.queue
				? rebindKindText(target.comparison.kind, locale)
				: t(locale, 'rebindPriceOnly');
	async function submit() {
		if (!target) return;
		busy = true;
		feedback = null;
		try {
			const result = await requestJson<{ rebound: boolean }>(
				'/admin/trial-intake/warteliste/rebind',
				{
					fromKey: course.key,
					lessonId: target.lesson.id,
					...(sums ? { monthly, yearly } : {}),
					_csrf: csrfToken,
				}
			);
			ondone(result.rebound);
		} catch (e) {
			feedback = t(locale, errorKey(e instanceof Error ? e.message : ''));
		} finally {
			busy = false;
		}
	}
	let heading = $state<HTMLHeadingElement>();
	onMount(() => {
		heading?.focus();
		if (course.price) {
			monthly = centsText(course.price.monthlyCents);
			yearly = centsText(course.price.yearlyCents);
		}
	});
</script>

<section class="card rebind-dialog" aria-labelledby={id}>
	<h3 {id} tabindex="-1" bind:this={heading}>
		{fill(t(locale, options.queue ? 'rebindTitle' : 'rebindPriceTitle'), {
			subject: course.course.subject,
		})}
	</h3>
	<p class="muted">{t(locale, options.queue ? 'rebindIntro' : 'rebindIntroPrice')}</p>
	<h4>{t(locale, 'rebindBefore')}</h4>
	<p>{summary(course.course)}</p>
	{#if course.price}<p>{amounts(course.price)}</p>{/if}
	{#if options.queue}<p>
			{fill(t(locale, 'rebindQueue'), { n: options.families, m: options.children })}
			{#if options.unconfirmed}<br /><span class="muted"
					>{fill(t(locale, 'unconfirmed'), { n: options.unconfirmed })}</span
				>{/if}
		</p>{/if}
	{#if course.attention?.length}<p class="mark mark-orange">
			{fill(t(locale, 'markAttention'), {
				reasons: attentionReasonsText(course.attention, locale),
			})}
		</p>{/if}
	<fieldset>
		<legend>{t(locale, 'rebindTargets')}</legend>
		{#if !options.targets.length}<p class="muted">{t(locale, 'rebindNoTargets')}</p>{/if}
		{#each options.targets as option (option.key)}
			<div class="rebind-target">
				<label class="check">
					<input
						type="radio"
						name={`${id}-target`}
						value={option.key}
						disabled={busy || !!option.block}
						bind:group={selected}
					/>
					<span>{summary(option.lesson)}</span>
				</label>
				<p>
					<span
						class={`rebind-kind ${option.block ? 'blocked' : options.queue ? option.comparison.kind : 'plain'}`}
						>{decision(option)}</span
					>
				</p>
				<ul class="muted">
					{#each option.comparison.differences as difference (difference.field)}<li>
							{differenceText(difference, locale)}
						</li>{:else}<li>{t(locale, 'rebindNone')}</li>{/each}
				</ul>
			</div>
		{/each}
	</fieldset>
	{#if target}
		<div class="letter-preview" role="status">
			<h4>{t(locale, 'rebindEffect')}</h4>
			{#if options.queue}
				<p>
					{fill(t(locale, 'rebindEffectMove'), {
						n: options.families,
						m: options.children,
					})}
				</p>
				{#if options.unconfirmed}<p>
						{fill(t(locale, 'rebindEffectCancel'), { n: options.unconfirmed })}
					</p>{/if}
			{:else}<p>{t(locale, 'rebindEffectPriceOnly')}</p>{/if}
			{#if target.price}<p>
					{fill(t(locale, 'rebindEffectReplace'), { amounts: amounts(target.price) })}
				</p>{/if}
			{#if options.queue && target.comparison.kind === 'plain'}<p>
					{t(locale, 'rebindEffectPlain')}
				</p>{/if}
			{#if options.queue && target.comparison.kind === 'notify'}<p class="mark mark-orange">
					{t(locale, 'rebindEffectNotify')}
					{fill(t(locale, 'markAttention'), {
						reasons: attentionReasonsText(target.comparison.reasons, locale),
					})}
				</p>{/if}
			{#if options.queue && target.comparison.kind === 'price'}<p class="mark mark-red">
					{t(locale, 'rebindEffectPrice')}
				</p>{/if}
		</div>
		{#if sums}
			<fieldset>
				<legend>{t(locale, 'rebindNewSums')}</legend>
				<label
					>{t(locale, 'monthlyContract')}<input
						class="amount"
						inputmode="decimal"
						autocomplete="off"
						bind:value={monthly}
						disabled={busy}
					/></label
				>
				<label
					>{t(locale, 'yearlyContract')}<input
						class="amount"
						inputmode="decimal"
						autocomplete="off"
						bind:value={yearly}
						disabled={busy}
					/></label
				>
			</fieldset>
		{/if}
	{/if}
	{#if feedback}<p class="error" role="alert">{feedback}</p>{/if}
	<div class="actions">
		<button class="primary" type="button" disabled={busy || !target} onclick={submit}
			>{t(locale, busy ? 'busy' : 'rebindConfirm')}</button
		>
		<button type="button" onclick={onclose}>{t(locale, 'cancel')}</button>
	</div>
</section>
