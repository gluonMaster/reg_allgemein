<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'admin.contracts.title')}</title></svelte:head>

<section class="admin-section">
	<h1>{translate('de', 'admin.contracts.title')}</h1>
	<p class="sensitive-notice">{translate('de', 'admin.contracts.productionBlocked')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	{#if data.previewReviewEnabled}
		<aside class="notice-card">
			<p>
				<strong>Preview-Vertragsprüfung aktiv.</strong> Nur synthetische Daten und kontrollierte
				Testempfänger verwenden. Alle erzeugten PDFs tragen TEST/ENTWURF.
			</p>
			<form class="admin-action-form" method="POST" action="?/installPreviewReview">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<button type="submit">Vier Preview-Prüfvorlagen bereitstellen</button>
			</form>
		</aside>
	{/if}
	<form class="filter-bar" method="GET">
		<label for="contract-search">{translate('de', 'admin.search')}</label>
		<input id="contract-search" name="q" value={data.query.q} maxlength="160" />
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	<details class="admin-card">
		<summary>{translate('de', 'admin.contracts.create')}</summary>
		<p>{translate('de', 'admin.contracts.createNotice')}</p>
		<form class="admin-action-form" method="POST" action="?/createDraft">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.createIdempotencyKey} />
			<label>Owner-ID<input name="userId" required /></label>
			<label>Child-ID<input name="childId" required /></label>
			<label>Academic-period-ID<input name="academicPeriodId" required /></label>
			<label>Template-version-ID<input name="templateVersionId" required /></label>
			<label>Price-quote-ID<input name="priceQuoteId" /></label>
			<label>Price-version-ID<input name="priceVersionId" /></label>
			<label>Price-rule-ID<input name="priceRuleId" /></label>
			<label>Gültig bis (ISO 8601 mit Zeitzone)<input name="expiresAt" required /></label>
			<label
				>Versionierter Render-Input (JSON)<textarea name="renderInput" rows="16" required
				></textarea></label
			>
			<label
				>Begründung einer manuellen Preisabweichung<textarea
					name="manualOverrideReason"
					minlength="10"
				></textarea></label
			>
			<label class="checkbox"
				><input type="checkbox" name="responsibilityConfirmed" value="confirmed" /><span
					>{translate('de', 'admin.contracts.overrideConfirm')}</span
				></label
			>
			<button type="submit">{translate('de', 'admin.contracts.create')}</button>
		</form>
	</details>
	<details class="admin-card">
		<summary>{translate('de', 'admin.contracts.mediaWithdrawal')}</summary>
		<p>{translate('de', 'admin.contracts.mediaWithdrawalNotice')}</p>
		<form class="admin-action-form" method="POST" action="?/mediaWithdrawal">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.mediaIdempotencyKey} />
			<label>Owner-ID<input name="ownerUserId" required /></label>
			<label>Child-ID<input name="childId" required /></label>
			<fieldset>
				<legend>Aufnahmearten</legend>
				<label class="checkbox"
					><input type="checkbox" name="captureScopes" value="photo" /> Foto</label
				>
				<label class="checkbox"
					><input type="checkbox" name="captureScopes" value="video" /> Video</label
				>
			</fieldset>
			<fieldset>
				<legend>Veröffentlichungswege</legend>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="website" /> Website</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="social_media" /> Social
					Media</label
				>
				<label class="checkbox"
					><input type="checkbox" name="publicationChannels" value="print" /> Print</label
				>
			</fieldset>
			<label
				>Kanal<select name="channel"
					><option value="office">Büro</option><option value="email">E-Mail</option
					><option value="phone">Telefon</option></select
				></label
			>
			<label
				>Eingang (ISO 8601 mit Zeitzone)<input
					name="receivedAt"
					placeholder="2026-07-22T10:00:00+02:00"
					required
				/></label
			>
			<label
				>{translate('de', 'admin.contracts.mediaEvidence')}<textarea
					name="evidenceSummary"
					minlength="5"
					maxlength="500"
					required
				></textarea></label
			>
			<button type="submit">{translate('de', 'admin.contracts.mediaWithdrawalSave')}</button>
		</form>
	</details>
	<h2>{translate('de', 'admin.contracts.endRequests')}</h2>
	{#if data.endRequests.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.endRequests as request}
			<article class="admin-card">
				<p class="item-kicker">{request.kind} · {request.status}</p>
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
							>Entscheidung<select name="decision">
								{#if request.kind === 'mutual_termination_request'}
									<option value="approved"
										>Einvernehmliche Beendigung zustimmen</option
									>
									<option value="declined"
										>Einvernehmliche Beendigung ablehnen</option
									>
								{:else}
									<option value="effective_date_confirmed"
										>Wirksamkeitsdatum bestätigen</option
									>
									<option value="disputed">Wirksamkeitsdatum klären</option>
								{/if}
							</select></label
						>
						<label
							>Wirksam am<input
								type="date"
								name="effectiveOn"
								value={request.calculated_effective_on ??
									request.requested_effective_on ??
									''}
							/></label
						>
						<label
							>Externe Forderungsprüfung<select name="externalDebtCheckResult">
								<option value="not_checked">Nicht geprüft</option>
								{#if request.kind === 'mutual_termination_request'}
									<option value="no_debt_reported"
										>Keine Forderung gemeldet</option
									>
									<option value="debt_reported">Forderung gemeldet</option>
									<option value="unknown">Unbekannt</option>
								{/if}
							</select></label
						>
						<label
							>Begründung<textarea name="reason" minlength="5" required
							></textarea></label
						>
						<button type="submit"
							>{translate('de', 'admin.contracts.terminationReview')}</button
						>
					</form>
				{/if}
			</article>
		{/each}
	</div>
	{#if data.offers.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-grid">
		{#each data.offers as offer}
			<article class="admin-card">
				<p class="item-kicker">{offer.status} · {offer.render_status}</p>
				<h2>{offer.contract_number}</h2>
				<p>{offer.child_name} · {offer.contract_kind}</p>
				{#if offer.status === 'draft'}
					<form class="admin-action-form" method="POST" action="?/renderSend">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="offerId" value={offer.id} />
						<input type="hidden" name="idempotencyKey" value={`render:${offer.id}`} />
						<button type="submit"
							>{translate('de', 'admin.contracts.renderSend')}</button
						>
					</form>
				{/if}
				{#if offer.status === 'accepted_by_parent'}
					<form class="admin-action-form" method="POST" action="?/formActivate">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="offerId" value={offer.id} />
						<label
							>{translate('de', 'admin.contracts.reason')}<textarea
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
							/><span>{translate('de', 'admin.contracts.confirm')}</span></label
						>
						<input type="hidden" name="idempotencyKey" value={`form:${offer.id}`} />
						<button type="submit"
							>{translate('de', 'admin.contracts.formActivate')}</button
						>
					</form>
				{/if}
				{#if offer.contract_id}<p>
						{translate('de', 'admin.contracts.certificate')}: {offer.certificate_status ??
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
										>Zweck<select name="purpose" required>
											<option value="contract_administration"
												>Vertragsbearbeitung</option
											>
											<option value="legal_evidence_review"
												>Prüfung des Vertragsnachweises</option
											>
										</select></label
									>
									<button type="submit">{artifact.kind}</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
</section>
