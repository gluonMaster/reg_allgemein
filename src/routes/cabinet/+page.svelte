<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { formatMessage, translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = $derived(new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }));
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
	const requestStatus = (status: string) => translate(uiLocale, `request.status.${status}` as 'request.status.draft');
</script>

<svelte:head><title>{translate(uiLocale, 'cabinet.title')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate(uiLocale, 'cabinet.navigationLabel')}>
		<a href="/">{translate(uiLocale, 'cabinet.link.home')}</a>
		<a href="/account/security">{translate(uiLocale, 'cabinet.link.security')}</a>
		<a href="/messages">{translate(uiLocale, 'cabinet.link.messages')}</a>
		<a href="/account/privacy">{translate(uiLocale, 'cabinet.link.privacy')}</a>
	</nav>
	<h1>{translate(uiLocale, 'cabinet.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'cabinet.profile.title')}</h2>
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
	</section>

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

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'cabinet.children.title')}</h2>
		{#if data.cabinet.children.length === 0}<p>
				{translate(uiLocale, 'cabinet.children.empty')}
			</p>{/if}
		<div class="child-list">
			{#each data.cabinet.children as child}
				<article class="child-item">
					<p class="item-kicker">
						{translate(uiLocale,
							child.origin === 'portal'
								? 'cabinet.child.portal'
								: 'cabinet.child.legacy'
						)}
					</p>
					<form
						method="POST"
						action={child.origin === 'portal' ? '?/updateChild' : '?/requestCorrection'}
					>
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="childId" value={child.id} />
						<label for={`name-${child.id}`}
							>{translate(uiLocale, 'cabinet.child.fullName')}</label
						>
						<input
							id={`name-${child.id}`}
							name="fullName"
							value={child.fullName}
							required
							maxlength="160"
						/>
						<label for={`birth-${child.id}`}
							>{translate(uiLocale, 'cabinet.child.birthDate')}</label
						>
						<input
							id={`birth-${child.id}`}
							name="birthDate"
							type="date"
							value={child.birthDate}
							required
						/>
						{#if child.origin === 'portal'}
							<label class="checkbox"
								><input type="checkbox" name="confirmDuplicate" value="true" />
								<span>{translate(uiLocale, 'cabinet.child.confirmDuplicate')}</span
								></label
							>
						{/if}
						<button type="submit" disabled={child.pendingCorrection}
							>{translate(uiLocale,
								child.origin === 'portal'
									? 'cabinet.child.update'
									: 'cabinet.child.correct'
							)}</button
						>
					</form>
					{#if child.pendingCorrection}<p>
							{translate(uiLocale, 'cabinet.child.correctionPending')}
						</p>{/if}
				</article>
			{/each}
		</div>

		<form class="child-create" method="POST" action="?/createChild">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<label for="new-child-name">{translate(uiLocale, 'cabinet.child.fullName')}</label>
			<input id="new-child-name" name="fullName" required maxlength="160" />
			<label for="new-child-birth">{translate(uiLocale, 'cabinet.child.birthDate')}</label>
			<input id="new-child-birth" name="birthDate" type="date" required />
			<label class="checkbox"
				><input type="checkbox" name="confirmDuplicate" value="true" />
				<span>{translate(uiLocale, 'cabinet.child.confirmDuplicate')}</span></label
			>
			<button type="submit">{translate(uiLocale, 'cabinet.child.create')}</button>
		</form>
	</section>

	<section class="cabinet-card">
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

	<section class="cabinet-card" id="price-reviews">
		<h2>{translate(uiLocale, 'cabinet.priceReviews.title')}</h2>
		<p>{translate(uiLocale, 'cabinet.priceReviews.basePriceNotice')}</p>
		{#if data.priceReviews.length === 0}<p>{translate(uiLocale, 'cabinet.priceReviews.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.priceReviews as priceReview}
				<article class="activity-item">
					<p class="item-kicker">{translateAdminCode(uiLocale, priceReview.status)}</p>
					<h3>{priceReview.courseName}</h3>
					<p>
						{priceReview.oldPriceCents === null ? '—' : money(priceReview.oldPriceCents)}
						→
						{priceReview.newFinalPriceCents === null ? '—' : money(priceReview.newFinalPriceCents)}
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
		{#if data.cabinet.extensions.threads.length === 0}<p>{translate(uiLocale, 'cabinet.messages.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.threads as thread}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, `messages.status.${thread.status}` as 'messages.status.open')}</p>
					<h3>{thread.label}</h3>
					{#if thread.detail}<p>{thread.detail}</p>{/if}
					{#if thread.href}<a href={thread.href}>{translate(uiLocale, 'cabinet.messages.open')}</a>{/if}
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
				{translate(uiLocale,
					notice === 'existing_external_sepa'
						? 'cabinet.payment.externalSepa'
						: notice === 'manual_payment'
							? 'cabinet.payment.manual'
							: 'cabinet.payment.notApplicable'
				)}
			</p>
		{/each}
	</section>

	<section class="cabinet-card" id="trials">
		<h2>{translate(uiLocale, 'cabinet.trials.title')}</h2>
		{#if data.cabinet.extensions.trials.length === 0}<p>{translate(uiLocale, 'cabinet.trials.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.trials as trial, index}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, trialStatusKeys[trial.status as keyof typeof trialStatusKeys])}</p>
					<h3>{trial.label}</h3>
					{#if trial.detail}<p>{trial.detail}</p>{/if}
					{#if trial.cancellable}
						<form method="POST" action="?/cancelTrial">
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="trialId" value={trial.id} />
							<input type="hidden" name="idempotencyKey" value={`cancel:${trial.id}:${index}`} />
							<button type="submit">{translate(uiLocale, 'cabinet.trials.cancel')}</button>
						</form>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="requests">
		<h2>{translate(uiLocale, 'cabinet.requests.title')}</h2>
		<p><a href="/requests/new?kind=nachhilfe">{translate(uiLocale, 'cabinet.requests.nachhilfe')}</a> · <a href="/requests/new?kind=individual">{translate(uiLocale, 'cabinet.requests.individual')}</a></p>
		{#if data.cabinet.extensions.requests.length === 0}<p>{translate(uiLocale, 'cabinet.requests.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.requests as request}
				<article class="activity-item">
					<p class="item-kicker">{requestStatus(request.status)}</p>
					<h3>{request.label}</h3>{#if request.detail}<p>{request.detail}</p>{/if}
					{#if request.href}<a href={request.href}>{translate(uiLocale, 'cabinet.requests.open')}</a>{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="contracts">
		<h2>{translate(uiLocale, 'cabinet.contracts.openTitle')}</h2>
		{#if data.cabinet.extensions.contractOffers.length === 0}<p>{translate(uiLocale, 'cabinet.contracts.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.contractOffers as offer}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, `contract.status.${offer.status}` as 'contract.status.draft')}</p>
					<h3>{offer.label}</h3>{#if offer.detail}<p>{offer.detail}</p>{/if}
					{#if offer.href}<a href={offer.href}>{translate(uiLocale, 'cabinet.contracts.open')}</a>{/if}
				</article>
			{/each}
		</div>
		<h2>{translate(uiLocale, 'cabinet.contracts.historyTitle')}</h2>
		{#if data.cabinet.extensions.contractHistory.length === 0}<p>{translate(uiLocale, 'cabinet.contracts.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.contractHistory as contract}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, `contract.status.${contract.status}` as 'contract.status.draft')}</p>
					<h3>{contract.label}</h3>{#if contract.detail}<p>{contract.detail}</p>{/if}
					{#if contract.href}<a href={contract.href}>{translate(uiLocale, 'cabinet.contracts.open')}</a>{/if}
				</article>
			{/each}
		</div>
	</section>
</main>
