<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		t,
		ageRangeLabel,
		dayLabel,
		entryStatusText,
		fill,
		formatDate,
		formatTimestamp,
		errorKey,
		tariffLabel,
		type TextKey,
	} from '../i18n';
	import { ageFit, lessonAgeRange } from '../age';
	import { euroAmount } from '../prices';
	import { itemLesson, type AdminDetailData } from '../contracts';
	import { requestJson } from '../client';
	import LessonCard from './LessonCard.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { translateAdminCode, translateOutboxWait } from '$lib/i18n';
	import { formatBerlinTime } from '$lib/i18n/locale';
	import '../intake.css';
	let { data }: { data: { intakeDetail: AdminDetailData; csrfToken: string } } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	const detail = $derived(data.intakeDetail);
	const request = $derived(detail.request);
	const waitlist = $derived(detail.waitlist);
	const waitlistAges = $derived(waitlist ? lessonAgeRange(waitlist.lesson) : null);
	let busy = $state(false),
		feedback = $state<TextKey | null>(null);
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	async function post(body: Record<string, unknown>) {
		if (busy) return;
		busy = true;
		feedback = null;
		try {
			await requestJson(`/admin/trial-intake/${request.id}`, {
				...body,
				_csrf: data.csrfToken,
			});
			await invalidateAll();
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			busy = false;
		}
	}
	const setProcessed = () => post({ processed: request.state !== 'processed' });
</script>

<svelte:head><title>{t(locale, 'request')} · {ORGANIZATION_NAME}</title></svelte:head>
<section class="intake">
	<a href={waitlist ? '/admin/trial-intake/warteliste' : '/admin/trial-intake'}
		>← {t(locale, waitlist ? 'adminWaitlist' : 'backList')}</a
	>
	<h2>
		{t(locale, waitlist ? 'waitlistEntry' : 'request')}
		{request.id.slice(0, 8)}
	</h2>
	<section class="card">
		<span class="badge"
			>{waitlist
				? entryStatusText(waitlist.status, locale)
				: t(locale, request.state === 'processed' ? 'processed' : 'verified')}</span
		>
		<h3>{request.parentFirstName} {request.parentLastName}</h3>
		<dl>
			<dt>{t(locale, 'phone')}</dt>
			<dd><a href={`tel:${request.phone.replace(/[^+\d]/g, '')}`}>{request.phone}</a></dd>
			<dt>{t(locale, 'email')}</dt>
			<dd><a href={`mailto:${request.email}`}>{request.email}</a></dd>
			<dt>{t(locale, 'created')}</dt>
			<dd>{formatTimestamp(request.createdAt, locale)}</dd>
			<dt>{t(locale, 'confirmed')}</dt>
			<dd>{request.verifiedAt ? formatTimestamp(request.verifiedAt, locale) : '—'}</dd>
			{#if request.processedAt}<dt>{t(locale, 'processed')}</dt>
				<dd>{formatTimestamp(request.processedAt, locale)}</dd>{/if}
		</dl>
	</section>
	{#if waitlist}
		<article class="card">
			<LessonCard lesson={waitlist.lesson} {locale} duration />
			<dl>
				<dt>{t(locale, 'tariff')}</dt>
				<dd>
					<strong
						>{tariffLabel(waitlist.tariff, locale)}, {fill(t(locale, 'perChildMonth'), {
							amount: euroAmount(
								waitlist.tariff === 'monthly'
									? waitlist.monthlyCents
									: waitlist.yearlyCents
							),
						})}</strong
					>
				</dd>
				<dt>{t(locale, 'shownSums')}</dt>
				<dd>
					{tariffLabel('monthly', locale)}
					{euroAmount(waitlist.monthlyCents)} € · {tariffLabel('yearly', locale)}
					{euroAmount(waitlist.yearlyCents)} €
				</dd>
				<dt>{t(locale, 'thresholdAtSignup')}</dt>
				<dd>{waitlist.minParticipants}</dd>
				<dt>{t(locale, 'consentGiven')}</dt>
				<dd>
					<code>{waitlist.consentVersion}</code> · {formatTimestamp(
						request.createdAt,
						locale
					)}
				</dd>
				<dt>{t(locale, 'entryStatus')}</dt>
				<dd>
					{entryStatusText(waitlist.status, locale)} · {formatTimestamp(
						waitlist.statusChangedAt,
						locale
					)}
				</dd>
				<dt>{t(locale, 'ageCheckDate')}</dt>
				<dd>{formatDate(waitlist.ageDate, locale)}</dd>
			</dl>
		</article>
	{/if}
	{#if waitlist?.start}{@const start = waitlist.start}
		<!-- WL-10: the start with the catalog card of that moment, the letter and its PDF. -->
		<section class="card">
			<h3>{t(locale, 'entryStartTitle')}</h3>
			<dl>
				<dt>{t(locale, 'startFirstDate')}</dt>
				<dd>
					<strong
						>{dayLabel(start.lesson.weekday, locale)}, {formatDate(
							start.firstDate,
							locale
						)}</strong
					>
				</dd>
				<dt>{t(locale, 'entryStartedAt')}</dt>
				<dd>{formatTimestamp(start.startedAt, locale)}</dd>
				<dt>{t(locale, 'entryParticipants')}</dt>
				<dd>{start.participants}</dd>
			</dl>
			<LessonCard lesson={start.lesson} {locale} duration />
			<h4>{t(locale, 'startLetterTitle')}</h4>
			{#each waitlist.letters as letter (letter.id)}<p>
					<strong>{translateAdminCode(locale, letter.status)}</strong>
					{#if letter.sentAt}· {formatBerlinTime(locale, letter.sentAt)}{/if}
					· {fill(t(locale, 'letterAttempts'), { n: letter.attempts })}
					{#if letter.lastErrorCode}· <code>{letter.lastErrorCode}</code>{/if}
					{#if letter.status === 'dead'}<button
							type="button"
							disabled={busy || !enhanced}
							onclick={() => post({ retryLetter: letter.id })}
							>{t(locale, 'letterRetry')}</button
						>{/if}
				</p>{/each}
			{#if waitlist.document}<p>
					{fill(t(locale, 'pdfStored'), {
						date: formatTimestamp(waitlist.document.createdAt, locale),
						size: Math.ceil(waitlist.document.byteSize / 1024),
					})}
				</p>
				<a
					class="button"
					href={`/admin/trial-intake/${request.id}/pdf`}
					download
					data-sveltekit-reload>{t(locale, 'pdfView')}</a
				>
			{:else}<p class="muted">{t(locale, 'pdfPending')}</p>{/if}
		</section>
	{/if}
	<section class="card">
		<h3>{t(locale, 'children')}</h3>
		<ul>
			{#each detail.children as child}{@const fit = waitlist
					? ageFit(waitlistAges, child.birth_date, waitlist.ageDate)
					: 'ok'}
				<li>
					{child.first_name}
					{child.last_name} · {formatDate(child.birth_date, locale)}
					{#if waitlistAges && fit !== 'ok'}<span class="age-badge"
							>{t(locale, fit === 'old' ? 'adminAgeOld' : 'adminAgeYoung')} ({ageRangeLabel(
								waitlistAges,
								locale
							)})</span
						>{/if}
				</li>{/each}
		</ul>
	</section>
	{#each detail.items as item (item.id)}{@const ages = lessonAgeRange(itemLesson(item))}
		<article class="card">
			<LessonCard lesson={itemLesson(item)} {locale} />
			<p><strong>{t(locale, 'date')}: {formatDate(item.desired_date, locale)}</strong></p>
			<ul>
				{#each item.children as child}{@const fit = ageFit(
						ages,
						child.birth_date,
						item.desired_date
					)}
					<li>
						{child.first_name}
						{child.last_name} · {formatDate(child.birth_date, locale)}
						{#if ages && fit !== 'ok'}<span class="age-badge"
								>{t(locale, fit === 'old' ? 'adminAgeOld' : 'adminAgeYoung')} ({ageRangeLabel(
									ages,
									locale
								)})</span
							>{/if}
					</li>{/each}
			</ul>
		</article>{/each}
	{#if waitlist?.status === 'waiting' && request.state === 'verified'}
		<section class="card">
			<p>{t(locale, 'withdrawAdminHint')}</p>
			<button
				type="button"
				disabled={busy || !enhanced}
				onclick={() => post({ withdraw: true })}
				>{t(locale, busy ? 'busy' : 'withdrawAdmin')}</button
			>
		</section>
	{/if}
	<section class="card">
		{#if waitlist?.status === 'waiting'}<p>{t(locale, 'processedWaiting')}</p>
		{:else}<p>{t(locale, 'processedHint')}</p>
			<button
				class="primary"
				type="button"
				disabled={busy || !enhanced}
				onclick={setProcessed}
				>{t(
					locale,
					busy ? 'busy' : request.state === 'processed' ? 'reopen' : 'markProcessed'
				)}</button
			>{/if}
		{#if feedback}<p role="alert" class="error">{t(locale, feedback)}</p>{/if}
	</section>
	<section class="card">
		<h3>{t(locale, 'delivery')}</h3>
		{#each detail.delivery as job (job.id)}<p>
				{t(locale, 'deliveryPart')}
				{job.part}/{job.total} · <strong>{translateAdminCode(locale, job.status)}</strong>
				{#if job.status === 'sent' && job.sentAt}· {formatBerlinTime(
						locale,
						job.sentAt
					)}{/if}
				{#if job.wait}· {translateOutboxWait(locale, job.wait, true)}{/if}
				{#if job.status === 'delivery_unknown'}· <code>{job.deliveryReference ?? '—'}</code>
					— {t(locale, 'deliveryUnknownHint')}{/if}
				{#if job.status === 'dead' && job.lastErrorCode}· {job.lastErrorCode}{/if}
			</p>{/each}
		<a
			class="button"
			href={`/admin/outbox?channel=telegram&q=${encodeURIComponent(`ti:${request.id}`)}`}
			>{t(locale, 'recovery')}</a
		>
	</section>
</section>
