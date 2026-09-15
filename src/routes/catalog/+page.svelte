<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { formatMessage, translate } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const euro = $derived(new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }));
	const money = (cents: number) => euro.format(cents / 100);
	const kindKeys = {
		group: 'catalog.kind.group',
		dance_group: 'catalog.kind.dance_group',
		nachhilfe: 'catalog.kind.nachhilfe',
		individual: 'catalog.kind.individual',
	} as const;
	const availabilityKeys = {
		available: 'catalog.availability.available',
		full: 'catalog.availability.full',
		unknown: 'catalog.availability.unknown',
		requires_admin_review: 'catalog.availability.requires_admin_review',
	} as const;
	const ctaKeys = {
		trial: 'catalog.cta.trial',
		nachhilfe_request: 'catalog.cta.nachhilfe_request',
		individual_request: 'catalog.cta.individual_request',
	} as const;
</script>

<svelte:head><title>{translate(uiLocale, 'catalog.title')}</title></svelte:head>

<main class="catalog-shell">
	<header class="catalog-header">
		<p class="item-kicker">{translate(uiLocale, 'catalog.kicker')}</p>
		<h1>{translate(uiLocale, 'catalog.title')}</h1>
		<p>{translate(uiLocale, 'catalog.scheduleNotice')}</p>
	</header>
	{#if data.courses.length === 0}<p class="catalog-empty">{translate(uiLocale, 'catalog.empty')}</p>{/if}
	<div class="catalog-grid">
		{#each data.courses as course}
			<article class="catalog-card">
				<p class="item-kicker">{course.academicPeriod} · {translate(uiLocale, kindKeys[course.lessonKind])}</p>
				<p class="course-subject">{course.subject}</p>
				<h2>{course.displayName}</h2>
				<ul class="session-list">
					{#each course.sessions as session}
						<li>
							<strong>{translate(uiLocale, `ui.day.${session.dayCode}`)} {session.startTime}–{session.endTime}</strong><br />
							{session.teacherName} · {session.locationDisplay} · {session.durationMinutes} {translate(uiLocale, 'ui.minute')}
						</li>
					{/each}
				</ul>
				<p class:availability-warning={course.availability.requiresManualReview}>
					{translate(uiLocale, availabilityKeys[course.availability.status])}
				</p>
				<p class="catalog-price">
					{#if !course.quote.parentPayable}
						{translate(uiLocale, 'catalog.price.funded')}
					{:else if course.quote.amountCents !== null && course.quote.status === 'quoted'}
						{formatMessage(uiLocale, course.quote.billingPeriodCode === 'per_45_minutes' ? 'catalog.price.perUnit' : 'catalog.price.perMonth', { amount: money(course.quote.amountCents) })}
					{:else if course.quote.amountCents !== null && course.quote.estimated}
						{formatMessage(uiLocale, 'pricing.estimatedMissingDuration', { amount: money(course.quote.amountCents) })}
					{:else}
						{translate(uiLocale, 'catalog.price.pending')}
					{/if}
				</p>
				{#if course.lessonKind === 'group' || course.lessonKind === 'dance_group'}
					<p class="muted price-notice">{translate(uiLocale, 'catalog.price.baseNotice')}</p>
				{/if}
				{#if course.availability.requiresManualReview}<p class="muted">{translate(uiLocale, 'catalog.manualReviewNotice')}</p>{/if}
				<div class="course-actions">
					<a class="catalog-cta" href={course.cta.href}>
						{translate(uiLocale, ctaKeys[course.cta.kind])}
					</a>
					{#if course.lessonKind === 'group' || course.lessonKind === 'dance_group'}
						<a class="contract-entry" href={`/messages?course=${encodeURIComponent(course.id)}`}>
							{translate(uiLocale, 'catalog.contract.cta')}
						</a>
					{/if}
				</div>
			</article>
		{/each}
	</div>
</main>

<style>
	.catalog-card { display: flex; flex-direction: column; align-items: stretch; }
	.course-subject { margin: .25rem 0; color: #176b54; font-weight: 700; }
	.catalog-card h2 { font-size: 1.3rem; }
	.catalog-price { margin-bottom: .35rem; }
	.price-notice { margin-top: 0; font-size: .9rem; }
	.course-actions { display: flex; flex-direction: column; align-items: start; gap: .5rem; margin-top: auto; padding-top: .75rem; }
	.course-actions a { display: inline-flex; align-items: center; min-height: 44px; max-width: 100%; overflow-wrap: anywhere; }
	.contract-entry { padding: .65rem .8rem; border: 1px solid #176b54; border-radius: .4rem; text-decoration: none; font-weight: 600; }
</style>
