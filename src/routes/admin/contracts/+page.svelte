<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'admin.contracts.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate(uiLocale, 'admin.contracts.title')}</h1>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.contracts.productionBlocked')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	{#if data.previewReviewEnabled}
		<aside class="notice-card">
			<p>
				<strong>{translate(uiLocale, 'ui.preview.active')}</strong> {translate(uiLocale, 'ui.preview.notice')}
			</p>
			<form class="admin-action-form" method="POST" action="?/installPreviewReview">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<button type="submit">{translate(uiLocale, 'ui.preview.install')}</button>
			</form>
		</aside>
	{/if}
	<form class="filter-bar" method="GET">
		<label for="contract-search">{translate(uiLocale, 'admin.search')}</label>
		<input id="contract-search" name="q" value={data.query.q} maxlength="160" />
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	<details class="admin-card">
		<summary>{translate(uiLocale, 'admin.contracts.create')}</summary>
		<p>{translate(uiLocale, 'admin.contracts.createNotice')}</p>
		<form class="admin-action-form" method="POST" action="?/createDraft">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.createIdempotencyKey} />
			<label>{translate(uiLocale, 'ui.ownerId')}<input name="userId" required /></label>
			<label>{translate(uiLocale, 'ui.childId')}<input name="childId" required /></label>
			<label>{translate(uiLocale, 'ui.periodId')}<input name="academicPeriodId" required /></label>
			<label>{translate(uiLocale, 'ui.templateVersionId')}<input name="templateVersionId" required /></label>
			<label>{translate(uiLocale, 'ui.priceQuoteId')}<input name="priceQuoteId" /></label>
			<label>{translate(uiLocale, 'ui.priceVersionId')}<input name="priceVersionId" /></label>
			<label>{translate(uiLocale, 'ui.priceRuleId')}<input name="priceRuleId" /></label>
			<label>{translate(uiLocale, 'ui.expiresAt')}<input name="expiresAt" required /></label>
			<label
				>{translate(uiLocale, 'ui.renderInput')}<textarea name="renderInput" rows="16" required
				></textarea></label
			>
			<label
				>{translate(uiLocale, 'ui.manualPriceReason')}<textarea
					name="manualOverrideReason"
					minlength="10"
				></textarea></label
			>
			<label class="checkbox"
				><input type="checkbox" name="responsibilityConfirmed" value="confirmed" /><span
					>{translate(uiLocale, 'admin.contracts.overrideConfirm')}</span
				></label
			>
			<button type="submit">{translate(uiLocale, 'admin.contracts.create')}</button>
		</form>
	</details>
	<details class="admin-card">
		<summary>{translate(uiLocale, 'admin.contracts.mediaWithdrawal')}</summary>
		<p>{translate(uiLocale, 'admin.contracts.mediaWithdrawalNotice')}</p>
		<form class="admin-action-form" method="POST" action="?/mediaWithdrawal">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.mediaIdempotencyKey} />
			<label>{translate(uiLocale, 'ui.ownerId')}<input name="ownerUserId" required /></label>
			<label>{translate(uiLocale, 'ui.childId')}<input name="childId" required /></label>
			<fieldset>
				<legend>{translate(uiLocale, 'ui.capture')}</legend>
				<label class="checkbox"
					><input type="checkbox" name="captureScopes" value="photo" /> {translate(uiLocale, 'ui.photo')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="captureScopes" value="video" /> {translate(uiLocale, 'ui.video')}</label
				>
			</fieldset>
			<fieldset>
				<legend>{translate(uiLocale, 'ui.publication')}</legend>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="website" /> {translate(uiLocale, 'ui.website')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="social_media" /> {translate(uiLocale, 'ui.socialMedia')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="print" /> {translate(uiLocale, 'ui.print')}</label
				>
			</fieldset>
			<label
				>{translate(uiLocale, 'ui.channel')}<select name="channel"
					><option value="office">{translate(uiLocale, 'ui.bureau')}</option><option value="email">{translate(uiLocale, 'ui.email')}</option
					><option value="phone">{translate(uiLocale, 'ui.phone')}</option></select
				></label
			>
			<label
				>{translate(uiLocale, 'ui.receivedAt')}<input
					name="receivedAt"
					placeholder="2026-07-22T10:00:00+02:00"
					required
				/></label
			>
			<label
				>{translate(uiLocale, 'admin.contracts.mediaEvidence')}<textarea
					name="evidenceSummary"
					minlength="5"
					maxlength="500"
					required
				></textarea></label
			>
			<button type="submit">{translate(uiLocale, 'admin.contracts.mediaWithdrawalSave')}</button>
		</form>
	</details>
	<h2>{translate(uiLocale, 'admin.contracts.endRequests')}</h2>
	{#if data.endRequests.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.endRequests as request}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, request.kind)} · {translateAdminCode(uiLocale, request.status)}</p>
				<h3>{request.contract_number}</h3>
				<p>{request.received_at}</p>
				{#if request.status === 'received'}
					<form class="admin-action-form" method="POST" action="?/terminationReview">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="endRequestId" value={request.id} />
						<input
							type="hidden"
							name="idempotencyKey"
							value={`termination-review:${request.id}`}
						/>
						<label
							>{translate(uiLocale, 'ui.decision')}<select name="decision">
								{#if request.kind === 'mutual_termination_request'}
									<option value="approved"
										>{translate(uiLocale, 'ui.endApprove')}</option
									>
									<option value="declined"
										>{translate(uiLocale, 'ui.endReject')}</option
									>
								{:else}
									<option value="effective_date_confirmed"
										>{translate(uiLocale, 'ui.effectiveConfirm')}</option
									>
									<option value="disputed">{translate(uiLocale, 'ui.effectiveClarify')}</option>
								{/if}
							</select></label
						>
						<label
							>{translate(uiLocale, 'ui.effectiveOn')}<input
								type="date"
								name="effectiveOn"
								value={request.calculated_effective_on ??
									request.requested_effective_on ??
									''}
							/></label
						>
						<label
							>{translate(uiLocale, 'ui.debtCheck')}<select name="externalDebtCheckResult">
								<option value="not_checked">{translate(uiLocale, 'ui.notChecked')}</option>
								{#if request.kind === 'mutual_termination_request'}
									<option value="no_debt_reported"
										>{translate(uiLocale, 'ui.noDebt')}</option
									>
									<option value="debt_reported">{translate(uiLocale, 'ui.debtReported')}</option>
									<option value="unknown">{translate(uiLocale, 'ui.unknown')}</option>
								{/if}
							</select></label
						>
						<label
							>{translate(uiLocale, 'ui.reason')}<textarea name="reason" minlength="5" required
							></textarea></label
						>
						<button type="submit"
							>{translate(uiLocale, 'admin.contracts.terminationReview')}</button
						>
					</form>
				{/if}
			</article>
		{/each}
	</div>
	{#if data.offers.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.offers as offer}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, offer.status)} · {translateAdminCode(uiLocale, offer.render_status)}</p>
				<h2>{offer.contract_number}</h2>
				<p>{offer.child_name} · {translateAdminCode(uiLocale, offer.contract_kind)}</p>
				{#if offer.status === 'draft'}
					<form class="admin-action-form" method="POST" action="?/renderSend">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="offerId" value={offer.id} />
						<input type="hidden" name="idempotencyKey" value={`render:${offer.id}`} />
						<button type="submit"
							>{translate(uiLocale, 'admin.contracts.renderSend')}</button
						>
					</form>
				{/if}
				{#if offer.status === 'accepted_by_parent'}
					<form class="admin-action-form" method="POST" action="?/formActivate">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="offerId" value={offer.id} />
						<label
							>{translate(uiLocale, 'admin.contracts.reason')}<textarea
								name="reason"
								required
								minlength="5"
							></textarea></label
						>
						<label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span>{translate(uiLocale, 'admin.contracts.confirm')}</span></label
						>
						<input type="hidden" name="idempotencyKey" value={`form:${offer.id}`} />
						<button type="submit"
							>{translate(uiLocale, 'admin.contracts.formActivate')}</button
						>
					</form>
				{/if}
				{#if offer.contract_id}<p>
						{translate(uiLocale, 'admin.contracts.certificate')}: {offer.certificate_status ??
							'pending'}
					</p>{/if}
				{#if offer.artifacts.length}
					<ul>
						{#each offer.artifacts as artifact}
							<li>
								<form
									method="POST"
									action={`/admin/contracts/artifacts/${encodeURIComponent(artifact.id)}/download`}
									class="admin-action-form"
								>
									<input type="hidden" name="_csrf" value={data.csrfToken} />
									<label
										>{translate(uiLocale, 'ui.purpose')}<select name="purpose" required>
											<option value="contract_administration"
												>{translate(uiLocale, 'ui.contractProcessing')}</option
											>
											<option value="legal_evidence_review"
												>{translate(uiLocale, 'ui.contractEvidenceReview')}</option
											>
										</select></label
									>
									<button type="submit">{translateAdminCode(uiLocale, artifact.kind)}</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
</section>
