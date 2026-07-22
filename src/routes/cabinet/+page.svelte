<script lang="ts">
	import '../../app.css';
	import { formatMessage, translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
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
	const requestStatus = (status: string) => translate('de', `request.status.${status}` as 'request.status.draft');
</script>

<svelte:head><title>{translate('de', 'cabinet.title')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate('de', 'cabinet.navigationLabel')}>
		<a href="/">{translate('de', 'cabinet.link.home')}</a>
		<a href="/account/security">{translate('de', 'cabinet.link.security')}</a>
		<a href="/messages">{translate('de', 'cabinet.link.messages')}</a>
	</nav>
	<h1>{translate('de', 'cabinet.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate('de', 'cabinet.profile.title')}</h2>
		<dl class="profile-grid">
			<div>
				<dt>{translate('de', 'auth.firstNameLabel')}</dt>
				<dd>{data.cabinet.profile.firstName}</dd>
			</div>
			<div>
				<dt>{translate('de', 'auth.lastNameLabel')}</dt>
				<dd>{data.cabinet.profile.lastName}</dd>
			</div>
			<div>
				<dt>{translate('de', 'auth.emailLabel')}</dt>
				<dd>{data.cabinet.profile.email}</dd>
			</div>
			<div>
				<dt>{translate('de', 'cabinet.profile.familyId')}</dt>
				<dd>{data.cabinet.profile.familyDisplayId}</dd>
			</div>
		</dl>
	</section>

	{#if data.cabinet.claimOffer}
		<section class="cabinet-card notice-card">
			<h2>{translate('de', 'cabinet.claim.title')}</h2>
			<p>
				{formatMessage('de', 'cabinet.claim.offer', {
					maskedEmail: data.cabinet.claimOffer.maskedEmail,
				})}
			</p>
			<form method="POST" action="?/requestClaim">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<button type="submit">{translate('de', 'cabinet.claim.request')}</button>
			</form>
		</section>
	{/if}

	<section class="cabinet-card">
		<h2>{translate('de', 'cabinet.children.title')}</h2>
		{#if data.cabinet.children.length === 0}<p>
				{translate('de', 'cabinet.children.empty')}
			</p>{/if}
		<div class="child-list">
			{#each data.cabinet.children as child}
				<article class="child-item">
					<p class="item-kicker">
						{translate(
							'de',
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
							>{translate('de', 'cabinet.child.fullName')}</label
						>
						<input
							id={`name-${child.id}`}
							name="fullName"
							value={child.fullName}
							required
							maxlength="160"
						/>
						<label for={`birth-${child.id}`}
							>{translate('de', 'cabinet.child.birthDate')}</label
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
								<span>{translate('de', 'cabinet.child.confirmDuplicate')}</span
								></label
							>
						{/if}
						<button type="submit" disabled={child.pendingCorrection}
							>{translate(
								'de',
								child.origin === 'portal'
									? 'cabinet.child.update'
									: 'cabinet.child.correct'
							)}</button
						>
					</form>
					{#if child.pendingCorrection}<p>
							{translate('de', 'cabinet.child.correctionPending')}
						</p>{/if}
				</article>
			{/each}
		</div>

		<form class="child-create" method="POST" action="?/createChild">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<label for="new-child-name">{translate('de', 'cabinet.child.fullName')}</label>
			<input id="new-child-name" name="fullName" required maxlength="160" />
			<label for="new-child-birth">{translate('de', 'cabinet.child.birthDate')}</label>
			<input id="new-child-birth" name="birthDate" type="date" required />
			<label class="checkbox"
				><input type="checkbox" name="confirmDuplicate" value="true" />
				<span>{translate('de', 'cabinet.child.confirmDuplicate')}</span></label
			>
			<button type="submit">{translate('de', 'cabinet.child.create')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate('de', 'cabinet.activities.title')}</h2>
		{#if data.cabinet.activities.length === 0}<p>
				{translate('de', 'cabinet.activities.empty')}
			</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.activities as activity}
				<article class="activity-item">
					<p class="item-kicker">
						{activity.origin === 'legacy'
							? translate('de', 'cabinet.activities.legacyService')
							: translate('de', activityKindKeys[activity.lessonKind])}
					</p>
					<h3>{activity.groupName}</h3>
					<p>
						{activity.childName}{activity.dayDisplay
							? ` · ${activity.dayDisplay}`
							: ''}{activity.durationMinutes
							? ` · ${activity.durationMinutes} Min.`
							: ''}
					</p>
					<p>
						{activity.basePriceCents !== null && activity.priceConfirmed
							? money(activity.basePriceCents)
							: translate('de', 'cabinet.activities.priceUnknown')}
					</p>
					{#if activity.origin === 'legacy'}<p class="muted">
							{translate('de', 'cabinet.activities.noDigitalContract')}
						</p>{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="price-reviews">
		<h2>{translate('de', 'cabinet.priceReviews.title')}</h2>
		<p>{translate('de', 'cabinet.priceReviews.basePriceNotice')}</p>
		{#if data.priceReviews.length === 0}<p>{translate('de', 'cabinet.priceReviews.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.priceReviews as priceReview}
				<article class="activity-item">
					<p class="item-kicker">{priceReview.status}</p>
					<h3>{priceReview.courseName}</h3>
					<p>
						{priceReview.oldPriceCents === null ? '—' : money(priceReview.oldPriceCents)}
						→
						{priceReview.newFinalPriceCents === null ? '—' : money(priceReview.newFinalPriceCents)}
					</p>
					<a href={`/price-reviews/${priceReview.publicReference}`}>
						{translate('de', 'cabinet.priceReviews.open')}
					</a>
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="messages">
		<h2>{translate('de', 'cabinet.messages.title')}</h2>
		<p><a href="/messages">{translate('de', 'cabinet.messages.new')}</a></p>
		{#if data.cabinet.extensions.threads.length === 0}<p>{translate('de', 'cabinet.messages.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.threads as thread}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', `messages.status.${thread.status}` as 'messages.status.open')}</p>
					<h3>{thread.label}</h3>
					{#if thread.detail}<p>{thread.detail}</p>{/if}
					{#if thread.href}<a href={thread.href}>{translate('de', 'cabinet.messages.open')}</a>{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card pricing-card">
		<h2>{translate('de', 'cabinet.pricing.totalTitle')}</h2>
		<p class="price-total">{money(data.cabinet.pricing.knownMonthlyBaseTotalCents)}</p>
		<p>{translate('de', 'cabinet.pricing.totalDisclaimer')}</p>
		{#if data.cabinet.pricing.unknownMonthlyBasePriceCount > 0}<p>
				{translate('de', 'cabinet.pricing.unknownNotice')}
			</p>{/if}
		{#if data.cabinet.activities.some((item) => item.lessonKind === 'individual')}<p>
				{formatMessage('de', 'cabinet.pricing.individualNotice', {
					amount: money(data.cabinet.pricing.individualUnitPriceCents),
				})}
			</p>{/if}
		{#if data.cabinet.activities.some((item) => item.lessonKind === 'nachhilfe')}<p>
				{translate('de', 'cabinet.pricing.nachhilfeNotice')}
			</p>{/if}
		{#each data.cabinet.pricing.paymentNotices as notice}
			<p>
				{translate(
					'de',
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
		<h2>{translate('de', 'cabinet.trials.title')}</h2>
		{#if data.cabinet.extensions.trials.length === 0}<p>{translate('de', 'cabinet.trials.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.trials as trial, index}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', trialStatusKeys[trial.status as keyof typeof trialStatusKeys])}</p>
					<h3>{trial.label}</h3>
					{#if trial.detail}<p>{trial.detail}</p>{/if}
					{#if trial.cancellable}
						<form method="POST" action="?/cancelTrial">
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="trialId" value={trial.id} />
							<input type="hidden" name="idempotencyKey" value={`cancel:${trial.id}:${index}`} />
							<button type="submit">{translate('de', 'cabinet.trials.cancel')}</button>
						</form>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="requests">
		<h2>{translate('de', 'cabinet.requests.title')}</h2>
		<p><a href="/requests/new?kind=nachhilfe">{translate('de', 'cabinet.requests.nachhilfe')}</a> · <a href="/requests/new?kind=individual">{translate('de', 'cabinet.requests.individual')}</a></p>
		{#if data.cabinet.extensions.requests.length === 0}<p>{translate('de', 'cabinet.requests.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.requests as request}
				<article class="activity-item">
					<p class="item-kicker">{requestStatus(request.status)}</p>
					<h3>{request.label}</h3>{#if request.detail}<p>{request.detail}</p>{/if}
					{#if request.href}<a href={request.href}>{translate('de', 'cabinet.requests.open')}</a>{/if}
				</article>
			{/each}
		</div>
	</section>

	<section class="cabinet-card" id="contracts">
		<h2>{translate('de', 'cabinet.contracts.openTitle')}</h2>
		{#if data.cabinet.extensions.contractOffers.length === 0}<p>{translate('de', 'cabinet.contracts.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.contractOffers as offer}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', `contract.status.${offer.status}` as 'contract.status.draft')}</p>
					<h3>{offer.label}</h3>{#if offer.detail}<p>{offer.detail}</p>{/if}
					{#if offer.href}<a href={offer.href}>{translate('de', 'cabinet.contracts.open')}</a>{/if}
				</article>
			{/each}
		</div>
		<h2>{translate('de', 'cabinet.contracts.historyTitle')}</h2>
		{#if data.cabinet.extensions.contractHistory.length === 0}<p>{translate('de', 'cabinet.contracts.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.cabinet.extensions.contractHistory as contract}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', `contract.status.${contract.status}` as 'contract.status.draft')}</p>
					<h3>{contract.label}</h3>{#if contract.detail}<p>{contract.detail}</p>{/if}
					{#if contract.href}<a href={contract.href}>{translate('de', 'cabinet.contracts.open')}</a>{/if}
				</article>
			{/each}
		</div>
	</section>
</main>
