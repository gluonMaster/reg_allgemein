<script lang="ts">
	import CabinetChildForm from '$lib/components/CabinetChildForm.svelte';
	import { formatCalendarDate } from '$lib/i18n/locale';
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { formatMessage, translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = $derived(
		new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', {
			style: 'currency',
			currency: 'EUR',
		})
	);
	const money = (cents: number) => euro.format(cents / 100);
	const activityKindKeys = {
		group: 'cabinet.activities.kind.group',
		dance_group: 'cabinet.activities.kind.danceGroup',
		nachhilfe: 'cabinet.activities.kind.nachhilfe',
		individual: 'cabinet.activities.kind.individual',
		needs_review: 'cabinet.activities.kind.needsReview',
	} as const;
	const trialStatusKeys = {
		requested: 'admin.code.requested',
		confirmed: 'admin.code.confirmed',
		rejected: 'admin.code.rejected',
		cancelled: 'admin.code.cancelled',
		attended: 'admin.code.attended',
		no_show: 'admin.code.no_show',
		converted: 'admin.code.converted',
	} as const;
	const requestStatus = (status: string) =>
		translate(uiLocale, `request.status.${status}` as 'request.status.draft');
	const attention = $derived([
		...data.cabinet.extensions.contractOffers
			.filter((item) => item.status === 'sent' && item.href)
			.map((item) => ({ ...item, statusLabel: translate(uiLocale, 'contract.status.sent') })),
		...data.priceReviews
			.filter((item) => item.status === 'sent')
			.map((item) => ({
				label: item.courseName,
				href: `/price-reviews/${item.publicReference}`,
				statusLabel: translate(uiLocale, 'cabinet.priceReviews.title'),
			})),
		...data.cabinet.extensions.requests
			.filter((item) => ['needs_info', 'needs_documents'].includes(item.status) && item.href)
			.map((item) => ({ ...item, statusLabel: requestStatus(item.status) })),
	]);
</script>

<svelte:head><title>{translate(uiLocale, 'cabinet.title')}</title></svelte:head>

<main class="cabinet-shell">
	<h1>{translate(uiLocale, 'cabinet.title')}</h1>
	<p class="muted">{translate(uiLocale, 'cabinet.intro')}</p>
	<div class="cabinet-nav cabinet-quick">
		<a class="button-link" href="/catalog">{translate(uiLocale, 'cabinet.quick.catalog')}</a>
		<a
			href="#add-child"
			onclick={() => {
				const section = document.getElementById('add-child');
				if (section instanceof HTMLDetailsElement) section.open = true;
			}}>{translate(uiLocale, 'cabinet.child.create')}</a
		>
		<a href="/messages">{translate(uiLocale, 'cabinet.quick.message')}</a>
	</div>
	<nav class="cabinet-nav" aria-label={translate(uiLocale, 'cabinet.navigationLabel')}>
		{#each [['activities', 'cabinet.activities.title'], ['children', 'cabinet.children.title'], ['trials', 'cabinet.trials.title'], ['requests', 'cabinet.requests.title'], ['contracts', 'cabinet.contracts.openTitle'], ['price-reviews', 'cabinet.priceReviews.title'], ['messages', 'cabinet.messages.title'], ['profile', 'cabinet.profile.title']] as [id, key]}
			<a href={`#${id}`}>{translate(uiLocale, key as 'cabinet.title')}</a>
		{/each}
	</nav>
	{#if attention.length > 0}
		<section class="cabinet-card notice-card" id="attention">
			<h2>{translate(uiLocale, 'cabinet.attention.title')}</h2>
			<ul>
				{#each attention as item}<li>
						<a href={item.href}>{item.label}</a>
						<span class="item-kicker">{item.statusLabel}</span>
					</li>{/each}
			</ul>
		</section>
	{/if}

	{#if form?.message}<p class="form-status" aria-live="polite">
			{translateUiFeedback(uiLocale, form.message)}
		</p>{/if}

	{#if data.cabinet.claimOffer}
		<section class="cabinet-card notice-card">
			<h2>{translate(uiLocale, 'cabinet.claim.title')}</h2>
			<p>
				{formatMessage(uiLocale, 'cabinet.claim.offer', {
					maskedEmail: data.cabinet.claimOffer.maskedEmail,
				})}
			</p>
			<form method="POST" action="?/requestClaim">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<button type="submit">{translate(uiLocale, 'cabinet.claim.request')}</button>
			</form>
		</section>
	{/if}

	<section class="cabinet-card" id="activities">
		<h2>{translate(uiLocale, 'cabinet.activities.title')}</h2>
		{#if data.cabinet.activities.length === 0}<p>
				{translate(uiLocale, 'cabinet.activities.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.activities as activity}
				<article class="activity-item">
					<p class="item-kicker">
						{activity.origin === 'legacy'
							? translate(uiLocale, 'cabinet.activities.legacyService')
							: translate(uiLocale, activityKindKeys[activity.lessonKind])}
					</p>
					<h3>{activity.groupName}</h3>
					{#if activity.active}<p class="item-kicker">
							{translate(uiLocale, 'cabinet.activity.active')}
						</p>{/if}
					{#if activity.teacherName}<p>{activity.teacherName}</p>{/if}
					<p>
						{activity.childName}{activity.dayDisplay
							? ` · ${activity.dayDisplay}`
							: ''}{activity.durationMinutes
							? ` · ${activity.durationMinutes} ${translate(uiLocale, 'ui.minute')}`
							: ''}
					</p>
					<p>
						{activity.basePriceCents !== null && activity.priceConfirmed
							? money(activity.basePriceCents)
							: translate(uiLocale, 'cabinet.activities.priceUnknown')}
					</p>
					{#if activity.origin === 'legacy'}<p class="muted">
							{translate(uiLocale, 'cabinet.activities.noDigitalContract')}
						</p>{/if}
				</article>
			{/each}
		</div>
	</section>
	<section class="cabinet-card pricing-card">
		<h2>{translate(uiLocale, 'cabinet.pricing.totalTitle')}</h2>
		<p class="price-total">{money(data.cabinet.pricing.knownMonthlyBaseTotalCents)}</p>
		<p>{translate(uiLocale, 'cabinet.pricing.totalDisclaimer')}</p>
		{#if data.cabinet.pricing.unknownMonthlyBasePriceCount > 0}<p>
				{translate(uiLocale, 'cabinet.pricing.unknownNotice')}
			</p>{/if}
		{#if data.cabinet.activities.some((item) => item.lessonKind === 'individual')}<p>
				{formatMessage(uiLocale, 'cabinet.pricing.individualNotice', {
					amount: money(data.cabinet.pricing.individualUnitPriceCents),
				})}
			</p>{/if}
		{#if data.cabinet.activities.some((item) => item.lessonKind === 'nachhilfe')}<p>
				{translate(uiLocale, 'cabinet.pricing.nachhilfeNotice')}
			</p>{/if}
		{#each data.cabinet.pricing.paymentNotices as notice}
			<p>
				{translate(
					uiLocale,
					notice === 'existing_external_sepa'
						? 'cabinet.payment.externalSepa'
						: notice === 'manual_payment'
							? 'cabinet.payment.manual'
							: 'cabinet.payment.notApplicable'
				)}
			</p>
		{/each}
	</section>
	<section class="cabinet-card" id="children">
		<h2>{translate(uiLocale, 'cabinet.children.title')}</h2>
		{#if data.cabinet.children.length === 0}<p class="muted">
				{translate(uiLocale, 'cabinet.children.empty')}
			</p>{/if}
		<div class="child-list">
			{#each data.cabinet.children as child (child.id)}
				<article class="child-item">
					<h3>{child.fullName}</h3>
					<p>
						<time datetime={child.birthDate}
							>{formatCalendarDate(uiLocale, child.birthDate)}</time
						>
					</p>
					<p class="item-kicker">
						{translate(
							uiLocale,
							child.origin === 'portal'
								? 'cabinet.child.portal'
								: 'cabinet.child.legacy'
						)}
					</p>
					{#if child.pendingCorrection}<p role="status">
							{translate(uiLocale, 'cabinet.child.correctionPending')}
						</p>{/if}
					<CabinetChildForm
						locale={uiLocale}
						csrfToken={data.csrfToken}
						{child}
						feedback={form}
					/>
				</article>
			{/each}
		</div>
		<CabinetChildForm locale={uiLocale} csrfToken={data.csrfToken} feedback={form} />
	</section>

	<section class="cabinet-card" id="trials">
		<h2>{translate(uiLocale, 'cabinet.trials.title')}</h2>
		{#if data.cabinet.extensions.trials.length === 0}<p>
				{translate(uiLocale, 'cabinet.trials.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.trials as trial, index}
				<article class="activity-item">
					<p class="item-kicker">
						{translate(
							uiLocale,
							trialStatusKeys[trial.status as keyof typeof trialStatusKeys]
						)}
					</p>
					<h3>{trial.label}</h3>
					{#if trial.detail}<p>{trial.detail}</p>{/if}
					{#if trial.cancellable}
						<form method="POST" action="?/cancelTrial">
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="trialId" value={trial.id} />
							<input
								type="hidden"
								name="idempotencyKey"
								value={`cancel:${trial.id}:${index}`}
							/>
							<button type="submit"
								>{translate(uiLocale, 'cabinet.trials.cancel')}</button
							>
						</form>
					{/if}
				</article>
			{/each}
		</div>
	</section>
	<section class="cabinet-card" id="requests">
		<h2>{translate(uiLocale, 'cabinet.requests.title')}</h2>
		<p>
			<a href="/requests/new?kind=nachhilfe"
				>{translate(uiLocale, 'cabinet.requests.nachhilfe')}</a
			>
			·
			<a href="/requests/new?kind=individual"
				>{translate(uiLocale, 'cabinet.requests.individual')}</a
			>
		</p>
		{#if data.cabinet.extensions.requests.length === 0}<p>
				{translate(uiLocale, 'cabinet.requests.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.requests as request}
				<article class="activity-item">
					<p class="item-kicker">{requestStatus(request.status)}</p>
					<h3>{request.label}</h3>
					{#if request.detail}<p>{request.detail}</p>{/if}
					{#if request.href}<a href={request.href}
							>{translate(uiLocale, 'cabinet.requests.open')}</a
						>{/if}
				</article>
			{/each}
		</div>
	</section>
	<section class="cabinet-card" id="contracts">
		<h2>{translate(uiLocale, 'cabinet.contracts.openTitle')}</h2>
		{#if data.cabinet.extensions.contractOffers.length === 0}<p>
				{translate(uiLocale, 'cabinet.contracts.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.contractOffers as offer}
				<article class="activity-item">
					<p class="item-kicker">
						{translate(
							uiLocale,
							`contract.status.${offer.status}` as 'contract.status.draft'
						)}
					</p>
					<h3>{offer.label}</h3>
					{#if offer.detail}<p>{offer.detail}</p>{/if}
					{#if offer.href}<a href={offer.href}
							>{translate(uiLocale, 'cabinet.contracts.open')}</a
						>{/if}
				</article>
			{/each}
		</div>
		<details id="contract-history">
			<summary
				>{translate(uiLocale, 'cabinet.contracts.historyTitle')} ({data.cabinet.extensions
					.contractHistory.length})</summary
			>
			{#if data.cabinet.extensions.contractHistory.length === 0}<p>
					{translate(uiLocale, 'cabinet.contracts.empty')}
				</p>{/if}
			<div class="activity-list">
				{#each data.cabinet.extensions.contractHistory as contract}
					<article class="activity-item">
						<p class="item-kicker">
							{translate(
								uiLocale,
								`contract.status.${contract.status}` as 'contract.status.draft'
							)}
						</p>
						<h3>{contract.label}</h3>
						{#if contract.detail}<p>{contract.detail}</p>{/if}
						{#if contract.href}<a href={contract.href}
								>{translate(uiLocale, 'cabinet.contracts.open')}</a
							>{/if}
					</article>
				{/each}
			</div>
		</details>
	</section>
	<section class="cabinet-card" id="price-reviews">
		<h2>{translate(uiLocale, 'cabinet.priceReviews.title')}</h2>
		<p>{translate(uiLocale, 'cabinet.priceReviews.basePriceNotice')}</p>
		{#if data.priceReviews.length === 0}<p>
				{translate(uiLocale, 'cabinet.priceReviews.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.priceReviews as priceReview}
				<article class="activity-item">
					<p class="item-kicker">{translateAdminCode(uiLocale, priceReview.status)}</p>
					<h3>{priceReview.courseName}</h3>
					<p>
						{priceReview.oldPriceCents === null
							? '—'
							: money(priceReview.oldPriceCents)}
						→
						{priceReview.newFinalPriceCents === null
							? '—'
							: money(priceReview.newFinalPriceCents)}
					</p>
					<a href={`/price-reviews/${priceReview.publicReference}`}>
						{translate(uiLocale, 'cabinet.priceReviews.open')}
					</a>
				</article>
			{/each}
		</div>
	</section>
	<section class="cabinet-card" id="messages">
		<h2>{translate(uiLocale, 'cabinet.messages.title')}</h2>
		<p><a href="/messages">{translate(uiLocale, 'cabinet.messages.new')}</a></p>
		{#if data.cabinet.extensions.threads.length === 0}<p>
				{translate(uiLocale, 'cabinet.messages.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.threads as thread}
				<article class="activity-item">
					<p class="item-kicker">
						{translate(
							uiLocale,
							`messages.status.${thread.status}` as 'messages.status.open'
						)}
					</p>
					<h3>{thread.label}</h3>
					{#if thread.detail}<p>{thread.detail}</p>{/if}
					{#if thread.href}<a href={thread.href}
							>{translate(uiLocale, 'cabinet.messages.open')}</a
						>{/if}
				</article>
			{/each}
		</div>
	</section>
	<details class="cabinet-card" id="profile">
		<summary>{translate(uiLocale, 'cabinet.profile.title')}</summary>
		<dl class="profile-grid">
			<div>
				<dt>{translate(uiLocale, 'auth.firstNameLabel')}</dt>
				<dd>{data.cabinet.profile.firstName}</dd>
			</div>
			<div>
				<dt>{translate(uiLocale, 'auth.lastNameLabel')}</dt>
				<dd>{data.cabinet.profile.lastName}</dd>
			</div>
			<div>
				<dt>{translate(uiLocale, 'auth.emailLabel')}</dt>
				<dd>{data.cabinet.profile.email}</dd>
			</div>
			<div>
				<dt>{translate(uiLocale, 'cabinet.profile.familyId')}</dt>
				<dd>{data.cabinet.profile.familyDisplayId}</dd>
			</div>
		</dl>
	</details>

	<nav class="cabinet-nav" aria-label={translate(uiLocale, 'cabinet.link.security')}>
		<a href="/account/security">{translate(uiLocale, 'cabinet.link.security')}</a>
		<a href="/account/privacy">{translate(uiLocale, 'cabinet.link.privacy')}</a>
	</nav>
</main>

<style>
	.cabinet-shell :global(summary) {
		cursor: pointer;
		min-height: 44px;
		padding: 0.65rem 0;
		font-weight: 650;
	}
	.cabinet-shell :global(details:target) {
		outline: 2px solid #176b54;
		outline-offset: 4px;
	}
	.cabinet-shell :global(input[name='fullName']) {
		max-width: 32rem;
	}
	.cabinet-shell :global(h3) {
		margin-top: 0;
	}
	.cabinet-shell :global(section),
	.cabinet-shell :global(details) {
		scroll-margin-top: 1rem;
	}
	.cabinet-nav {
		gap: 0.3rem 1rem;
		margin-bottom: 0.5rem;
	}
	.cabinet-quick .button-link {
		background: #176b54;
		color: white;
		padding: 0.65rem 1rem;
		border-radius: 0.4rem;
		text-decoration: none;
		font-weight: 650;
	}
	#attention ul {
		padding-left: 1.2rem;
		margin-bottom: 0;
	}
	#attention a {
		display: inline-block;
		padding: 0.65rem 0;
	}
</style>
