<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { enhance } from '$app/forms';
	import { formatTimestamp } from '$lib/i18n/locale';
	import { translateAdminCode } from '$lib/i18n';
	import type { MessageKey } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const detailKeys: Record<string, MessageKey> = {
		group_yearly: 'admin.contracts.kind.group_yearly',
		group_monthly: 'admin.contracts.kind.group_monthly',
		individual_hourly: 'admin.contracts.kind.individual_hourly',
		nachhilfe_hourly: 'admin.contracts.kind.nachhilfe_hourly',
		offer_html: 'contract.artifact.offer_html',
		offer_pdf: 'contract.artifact.offer_pdf',
		formation_certificate_pdf: 'contract.artifact.formation_certificate_pdf',
		ordinary_termination: 'admin.contracts.end.ordinary_termination',
		extraordinary_termination: 'admin.contracts.end.extraordinary_termination',
		mutual_termination_request: 'admin.contracts.end.mutual_termination_request',
		withdrawal: 'admin.contracts.end.statutory_withdrawal',
		received: 'admin.contracts.end.received',
		effective_date_confirmed: 'admin.contracts.end.effective_date_confirmed',
		disputed: 'admin.contracts.end.disputed',
		approved: 'admin.contracts.end.approved',
		declined: 'admin.contracts.end.declined',
		completed: 'admin.contracts.end.completed',
	};
	const detailLabel = (code: string) =>
		detailKeys[code]
			? translate(uiLocale, detailKeys[code])
			: translateAdminCode(uiLocale, code);
	const offerStatus = (status: string) => {
		switch (status) {
			case 'sent':
				return translate(uiLocale, 'admin.contracts.status.sent');
			case 'accepted_by_parent':
				return translate(uiLocale, 'admin.contracts.status.accepted_by_parent');
			case 'approved_by_admin':
				return translate(uiLocale, 'admin.contracts.status.approved_by_admin');
			case 'active':
				return translate(uiLocale, 'admin.contracts.status.active');
			case 'ended':
				return translate(uiLocale, 'admin.contracts.status.ended');
			case 'terminated':
				return translate(uiLocale, 'admin.contracts.status.ended');
			case 'void':
				return translate(uiLocale, 'admin.contracts.status.cancelled');
			case 'cancelled':
				return translate(uiLocale, 'admin.contracts.status.cancelled');
			case 'expired':
				return translate(uiLocale, 'contract.status.expired');
			case 'superseded':
				return translate(uiLocale, 'contract.status.superseded');
			case 'declined_by_parent':
				return translate(uiLocale, 'contract.status.declined_by_parent');
			default:
				return translateAdminCode(uiLocale, status);
		}
	};
	const pdfStatus = (status: string) => {
		switch (status) {
			case 'ready':
				return translate(uiLocale, 'admin.contracts.pdf.ready');
			case 'draft':
			case 'not_rendered':
			case 'not_started':
			case 'pending':
				return translate(uiLocale, 'admin.contracts.pdf.draft');
			case 'rendering':
				return translate(uiLocale, 'admin.contracts.pdf.rendering');
			case 'failed':
				return translate(uiLocale, 'admin.contracts.pdf.failed');
			default:
				return translateAdminCode(uiLocale, status);
		}
	};
</script>

<svelte:head><title>{translate(uiLocale, 'admin.contracts.title')}</title></svelte:head>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.contracts.title')}</h2>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.contracts.productionBlocked')}</p>
	{#if form?.message}<p
			id="contract-feedback"
			class="form-status"
			role={form.success ? 'status' : 'alert'}
		>
			{translateUiFeedback(uiLocale, form.message)}
		</p>{/if}
	{#if data.previewReviewEnabled}
		<aside class="notice-card">
			<p>
				<strong>{translate(uiLocale, 'ui.preview.active')}</strong>
				{translate(uiLocale, 'ui.preview.notice')}
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
	<h3>{translate(uiLocale, 'admin.contracts.offers')}</h3>
	{#if data.offers.length === 0}<p class="admin-empty">
			{translate(uiLocale, 'admin.contracts.emptyOffers')}
		</p>{/if}
	<div class="admin-grid">
		{#each data.offers as offer}
			<article class="admin-card">
				<p class="item-kicker">{offerStatus(offer.contract_status ?? offer.status)}</p>
				<h3>{offer.contract_number}</h3>
				<p>{offer.child_name} · {detailLabel(offer.contract_kind)}</p>
				<p>
					{translate(uiLocale, 'admin.contracts.pdfStatus')}: {pdfStatus(
						offer.render_status
					)}
				</p>
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
					<details open={form?.success === false}>
						<summary>{translate(uiLocale, 'admin.contracts.formActivate')}</summary>
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
								/><span>{translate(uiLocale, 'admin.contracts.confirm')}</span
								></label
							>
							<input type="hidden" name="idempotencyKey" value={`form:${offer.id}`} />
							<button type="submit"
								>{translate(uiLocale, 'admin.contracts.formActivate')}</button
							>
						</form>
					</details>
				{/if}
				{#if offer.contract_id}<p>
						{translate(uiLocale, 'admin.contracts.certificate')}: {pdfStatus(
							offer.certificate_status ?? 'draft'
						)}
					</p>{/if}
				{#if offer.artifacts.length}
					<details>
						<summary>{translate(uiLocale, 'admin.contracts.documents')}</summary>
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
											>{translate(uiLocale, 'ui.purpose')}<select
												name="purpose"
												required
											>
												<option value="contract_administration"
													>{translate(
														uiLocale,
														'ui.contractProcessing'
													)}</option
												>
												<option value="legal_evidence_review"
													>{translate(
														uiLocale,
														'ui.contractEvidenceReview'
													)}</option
												>
											</select></label
										>
										<button type="submit">{detailLabel(artifact.kind)}</button>
									</form>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</article>
		{/each}
	</div>

	<details class="admin-card" open={form?.success === false}>
		<summary>{translate(uiLocale, 'admin.contracts.create')}</summary>
		<p>{translate(uiLocale, 'admin.contracts.createNotice')}</p>
		<form
			class="admin-action-form contract-editor"
			method="POST"
			action="?/createDraft"
			aria-describedby={form?.message ? 'contract-feedback' : undefined}
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
				}}
		>
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.createIdempotencyKey} />
			<label>{translate(uiLocale, 'ui.ownerId')}<input name="userId" required /></label>
			<label>{translate(uiLocale, 'ui.childId')}<input name="childId" required /></label>
			<label
				>{translate(uiLocale, 'ui.periodId')}<input
					name="academicPeriodId"
					required
				/></label
			>
			<label
				>{translate(uiLocale, 'ui.templateVersionId')}<input
					name="templateVersionId"
					required
				/></label
			>
			<label>{translate(uiLocale, 'ui.priceQuoteId')}<input name="priceQuoteId" /></label>
			<label>{translate(uiLocale, 'ui.priceVersionId')}<input name="priceVersionId" /></label>
			<label>{translate(uiLocale, 'ui.priceRuleId')}<input name="priceRuleId" /></label>
			<label
				>{translate(uiLocale, 'ui.expiresAt')}<input
					name="expiresAt"
					required
					aria-describedby="expires-hint"
				/><small id="expires-hint"
					>{translate(uiLocale, 'admin.contracts.expiresHint')}</small
				></label
			>
			<label class="wide-field"
				>{translate(uiLocale, 'ui.renderInput')}<textarea
					name="renderInput"
					rows="16"
					required
					spellcheck="false"
					aria-describedby="render-hint"
				></textarea></label
			>
			<p id="render-hint" class="wide-field">
				{translate(uiLocale, 'admin.contracts.jsonHint')}
			</p>
			<label class="wide-field"
				>{translate(uiLocale, 'ui.manualPriceReason')}<textarea
					name="manualOverrideReason"
					minlength="10"
				></textarea></label
			>
			<label class="checkbox wide-field"
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
					><input type="checkbox" name="captureScopes" value="photo" />
					{translate(uiLocale, 'ui.photo')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="captureScopes" value="video" />
					{translate(uiLocale, 'ui.video')}</label
				>
			</fieldset>
			<fieldset>
				<legend>{translate(uiLocale, 'ui.publication')}</legend>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="website" />
					{translate(uiLocale, 'ui.website')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="social_media" />
					{translate(uiLocale, 'ui.socialMedia')}</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="print" />
					{translate(uiLocale, 'ui.print')}</label
				>
			</fieldset>
			<label
				>{translate(uiLocale, 'ui.channel')}<select name="channel"
					><option value="office">{translate(uiLocale, 'ui.bureau')}</option><option
						value="email">{translate(uiLocale, 'ui.email')}</option
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
			<button type="submit"
				>{translate(uiLocale, 'admin.contracts.mediaWithdrawalSave')}</button
			>
		</form>
	</details>
	<h2>{translate(uiLocale, 'admin.contracts.endRequests')}</h2>
	{#if data.endRequests.length === 0}<p class="admin-empty">
			{translate(uiLocale, 'admin.contracts.emptyEndRequests')}
		</p>{/if}
	<div class="admin-grid">
		{#each data.endRequests as request}
			<article class="admin-card">
				<p class="item-kicker">
					{detailLabel(request.kind)} · {detailLabel(request.status)}
				</p>
				<h3>{request.contract_number}</h3>
				<p>{formatTimestamp(uiLocale, request.received_at)}</p>
				{#if request.status === 'received'}
					<details open={form?.success === false}>
						<summary>{translate(uiLocale, 'admin.contracts.review')}</summary>
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
										<option value="disputed"
											>{translate(uiLocale, 'ui.effectiveClarify')}</option
										>
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
								>{translate(uiLocale, 'ui.debtCheck')}<select
									name="externalDebtCheckResult"
								>
									<option value="not_checked"
										>{translate(uiLocale, 'ui.notChecked')}</option
									>
									{#if request.kind === 'mutual_termination_request'}
										<option value="no_debt_reported"
											>{translate(uiLocale, 'ui.noDebt')}</option
										>
										<option value="debt_reported"
											>{translate(uiLocale, 'ui.debtReported')}</option
										>
										<option value="unknown"
											>{translate(uiLocale, 'ui.unknown')}</option
										>
									{/if}
								</select></label
							>
							<label
								>{translate(uiLocale, 'ui.reason')}<textarea
									name="reason"
									minlength="5"
									required
								></textarea></label
							>
							<button type="submit"
								>{translate(uiLocale, 'admin.contracts.terminationReview')}</button
							>
						</form>
					</details>
				{/if}
			</article>
		{/each}
	</div>
</section>
