<script lang="ts">
	import '../../app.css';
	import AuthNav from '$lib/components/AuthNav.svelte';
	import { formatMessage, translate } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
	const money = (cents: number) => euro.format(cents / 100);
	const dayLabels = {
		MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag',
		FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag',
	} as const;
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

<svelte:head><title>{translate('de', 'catalog.title')}</title></svelte:head>

<main class="catalog-shell">
	<AuthNav />
	<header class="catalog-header">
		<p class="item-kicker">{translate('de', 'catalog.kicker')}</p>
		<h1>{translate('de', 'catalog.title')}</h1>
		<p>{translate('de', 'catalog.scheduleNotice')}</p>
	</header>
	{#if data.courses.length === 0}<p class="catalog-empty">{translate('de', 'catalog.empty')}</p>{/if}
	<div class="catalog-grid">
		{#each data.courses as course}
			<article class="catalog-card">
				<p class="item-kicker">{course.academicPeriod} · {translate('de', kindKeys[course.lessonKind])}</p>
				<h2>{course.displayName}</h2>
				<p>{course.subject}</p>
				<ul class="session-list">
					{#each course.sessions as session}
						<li>
							<strong>{dayLabels[session.dayCode]} {session.startTime}–{session.endTime}</strong><br />
							{session.teacherName} · {session.locationDisplay} · {session.durationMinutes} Min.
						</li>
					{/each}
				</ul>
				<p class:availability-warning={course.availability.requiresManualReview}>
					{translate('de', availabilityKeys[course.availability.status])}
				</p>
				<p class="catalog-price">
					{#if !course.quote.parentPayable}
						{translate('de', 'catalog.price.funded')}
					{:else if course.quote.amountCents !== null && course.quote.status === 'quoted'}
						{formatMessage('de', course.quote.billingPeriodCode === 'per_45_minutes' ? 'catalog.price.perUnit' : 'catalog.price.perMonth', { amount: money(course.quote.amountCents) })}
					{:else if course.quote.amountCents !== null && course.quote.estimated}
						{formatMessage('de', 'pricing.estimatedMissingDuration', { amount: money(course.quote.amountCents) })}
					{:else}
						{translate('de', 'catalog.price.pending')}
					{/if}
				</p>
				<a class="catalog-cta" href={course.cta.href}>
					{translate('de', ctaKeys[course.cta.kind])}
				</a>
				{#if course.availability.requiresManualReview}<p class="muted">{translate('de', 'catalog.manualReviewNotice')}</p>{/if}
			</article>
		{/each}
	</div>
</main>
