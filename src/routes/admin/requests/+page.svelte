<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import EvidenceText from '$lib/components/EvidenceText.svelte';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { formatMessage, translate, translateAdminCode, type MessageKey } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = $derived(new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }));
	const requestStatuses = [
		'draft',
		'submitted',
		'needs_documents',
		'needs_info',
		'pending_admin_review',
		'approved',
		'rejected',
		'cancelled',
	];
	const documentStatuses = [
		'quarantined',
		'clean',
		'infected',
		'approved',
		'rejected',
		'deleted',
	];
	const requestStatus = (status: string) =>
		translate(uiLocale, `request.status.${status}` as MessageKey);
	const documentStatus = (status: string) =>
		translate(uiLocale, `request.document.status.${status}` as MessageKey);
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.requests.title')}</h2>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.requests.quarantineNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="request-q">{translate(uiLocale, 'admin.search')}</label><input
			id="request-q"
			name="q"
			value={data.query.q}
			maxlength="160"
		/>
		<label for="request-status">{translate(uiLocale, 'admin.requests.requestStatus')}</label><select
			id="request-status"
			name="status"
			value={data.query.status}
			><option value="">{translate(uiLocale, 'admin.all')}</option
			>{#each requestStatuses as status}<option value={status}>{requestStatus(status)}</option
				>{/each}</select
		>
		<label for="request-kind">{translate(uiLocale, 'admin.requests.kind')}</label><select
			id="request-kind"
			name="kind"
			value={data.query.kind}
			><option value="">{translate(uiLocale, 'admin.all')}</option><option value="nachhilfe"
				>{translate(uiLocale, 'request.kind.nachhilfe')}</option
			><option value="individual">{translate(uiLocale, 'request.kind.individual')}</option
			></select
		>
		<label for="document-status">{translate(uiLocale, 'admin.requests.documentStatus')}</label
		><select id="document-status" name="documentStatus" value={data.documentStatus}
			><option value="">{translate(uiLocale, 'admin.all')}</option
			>{#each documentStatuses as status}<option value={status}
					>{documentStatus(status)}</option
				>{/each}</select
		>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
</section>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.requests.requests')}</h2>
	{#if data.queue.requests.length === 0}<p>{translate(uiLocale, 'admin.requests.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.queue.requests as request, index}
			<article class="admin-card">
				<p class="item-kicker">
					{requestStatus(request.status) || translateAdminCode(uiLocale, request.status)} · {translate(uiLocale,
						request.request_kind === 'nachhilfe'
							? 'request.kind.nachhilfe'
							: 'request.kind.individual'
					)}
				</p>
				<h3>{request.child_name}</h3>
				<p>{request.subjects_raw} · {translateAdminCode(uiLocale, request.preferred_format)}</p>
				<p>
					{request.parent_payable
						? formatMessage(uiLocale, 'admin.requests.parentRate', {
								amount: euro.format(request.unit_rate_cents / 100),
							})
						: formatMessage(uiLocale, 'admin.requests.fundedRate', {
								amount: euro.format(request.unit_rate_cents / 100),
								funding: request.funding_kind,
							})}
				</p>
				{#if request.authorization_id}<p>
						{formatMessage(uiLocale, 'admin.requests.authorization', {
							status: request.authorization_status ?? '',
						})}
						{request.valid_from ? `· ${request.valid_from}–${request.valid_until}` : ''}
					</p>{/if}
				{#if request.authorization_id && ['pending_review', 'approved'].includes(request.authorization_status ?? '')}
					<form method="POST" action="?/authorizationReview" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} /><input
							type="hidden"
							name="authorizationId"
							value={request.authorization_id}
						/><input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:authorization:${index}`}
						/>
						<label for={`authorization-action-${index}`}
							>{translate(uiLocale, 'admin.requests.authorizationDecision')}</label
						><select id={`authorization-action-${index}`} name="action"
							>{#if request.authorization_status === 'pending_review'}<option
									value="approve"
									>{translate(uiLocale, 'admin.requests.approve')}</option
								><option value="reject"
									>{translate(uiLocale, 'admin.requests.reject')}</option
								>{:else}<option value="revoke"
									>{translate(uiLocale, 'admin.requests.revoke')}</option
								>{/if}</select
						>
						{#if request.authorization_status === 'pending_review'}<label
								for={`authorization-kind-${index}`}
								>{translate(uiLocale, 'request.fundingKind')}</label
							><select id={`authorization-kind-${index}`} name="kind"
								><option
									value="jobcenter"
									selected={request.authorization_kind === 'jobcenter'}
									>{translate(uiLocale, 'request.funding.jobcenter')}</option
								><option
									value="socialamt"
									selected={request.authorization_kind === 'socialamt'}
									>{translate(uiLocale, 'request.funding.socialamt')}</option
								></select
							><label for={`valid-from-${index}`}
								>{translate(uiLocale, 'admin.requests.validFrom')}</label
							><input id={`valid-from-${index}`} name="validFrom" type="date" /><label
								for={`valid-until-${index}`}
								>{translate(uiLocale, 'admin.requests.validUntil')}</label
							><input
								id={`valid-until-${index}`}
								name="validUntil"
								type="date"
							/>{/if}
						<label for={`authorization-reason-${index}`}
							>{translate(uiLocale, 'admin.requests.reason')}</label
						><textarea
							id={`authorization-reason-${index}`}
							name="reason"
							required
							maxlength="1000"
						></textarea><label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span>{translate(uiLocale, 'admin.requests.confirm')}</span></label
						><button type="submit"
							>{translate(uiLocale, 'admin.requests.authorizationApply')}</button
						>
					</form>
				{/if}
				{#if request.status === 'pending_admin_review'}
					<form method="POST" action="?/requestTransition" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} /><input
							type="hidden"
							name="requestId"
							value={request.id}
						/><input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:request:${index}`}
						/><label for={`request-action-${index}`}
							>{translate(uiLocale, 'admin.requests.requestDecision')}</label
						><select id={`request-action-${index}`} name="action"
							><option value="approve"
								>{translate(uiLocale, 'admin.requests.approve')}</option
							><option value="needs_documents"
								>{translate(uiLocale, 'admin.requests.needsDocuments')}</option
							><option value="needs_info"
								>{translate(uiLocale, 'admin.requests.needsInfo')}</option
							><option value="reject"
								>{translate(uiLocale, 'admin.requests.reject')}</option
							><option value="cancel"
								>{translate(uiLocale, 'admin.requests.cancel')}</option
							></select
						><label for={`request-reason-${index}`}
							>{translate(uiLocale, 'admin.requests.reason')}</label
						><textarea
							id={`request-reason-${index}`}
							name="reason"
							required
							maxlength="1000"
						></textarea><label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span>{translate(uiLocale, 'admin.requests.confirm')}</span></label
						><button type="submit"
							>{translate(uiLocale, 'admin.requests.requestApply')}</button
						>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.requests.documents')}</h2>
	{#if data.queue.documents.length === 0}<p>
			{translate(uiLocale, 'admin.requests.documentsEmpty')}
		</p>{/if}
	<div class="admin-list">
		{#each data.queue.documents as document, index}
			<article class="admin-card">
				<p class="item-kicker">{documentStatus(document.review_status)}</p>
				<h3>{document.child_name}</h3>
				<p>
					{document.detected_type.toUpperCase()} · {(document.size_bytes / 1024).toFixed(
						0
					)} {translate(uiLocale, 'ui.document.sizeChecksum')} {document.sha256.slice(0, 12)}
				</p>
				{#if document.review_status === 'quarantined'}
					<form
						method="POST"
						action={`/admin/requests/documents/${encodeURIComponent(document.id)}/download`}
						class="admin-action-form"
					>
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<label for={`document-download-purpose-${index}`}
							>{translate(uiLocale, 'ui.document.downloadPurpose')}</label
						>
						<select id={`document-download-purpose-${index}`} name="purpose" required>
							<option value="local_av_scan">{translate(uiLocale, 'ui.document.localScan')}</option>
						</select>
						<button type="submit"
							>{translate(uiLocale, 'admin.requests.quarantineDownload')}</button
						>
					</form>
					<form method="POST" action="?/documentAttestation" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} /><input
							type="hidden"
							name="documentId"
							value={document.id}
						/><input
							type="hidden"
							name="documentSha256"
							value={document.sha256}
						/><input
							type="hidden"
							name="attestationTextVersion"
							value={data.attestationTextVersion}
						/><input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:attestation:${index}`}
						/><label for={`scan-outcome-${index}`}
							>{translate(uiLocale, 'admin.requests.avOutcome')}</label
						><select id={`scan-outcome-${index}`} name="outcome"
							><option value="clean"
								>{translate(uiLocale, 'admin.requests.avClean')}</option
							><option value="infected"
								>{translate(uiLocale, 'admin.requests.avInfected')}</option
							></select
						><label for={`scanner-label-${index}`}
							>{translate(uiLocale, 'admin.requests.scanner')}</label
						><input
							id={`scanner-label-${index}`}
							name="scannerLabel"
							required
							maxlength="120"
						/><label for={`scanner-version-${index}`}
							>{translate(uiLocale, 'admin.requests.scannerVersion')}</label
						><input
							id={`scanner-version-${index}`}
							name="scannerVersion"
							required
							maxlength="120"
						/><label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span
								><EvidenceText messageKey="admin.requests.avConfirmation" parameters={{
									checksum: document.sha256.slice(0, 12),
									version: data.attestationTextVersion,
								}} /></span
							></label
						><button type="submit">{translate(uiLocale, 'admin.requests.avAttest')}</button>
					</form>
				{/if}
				{#if document.review_status === 'clean'}
					<form method="POST" action="?/documentReview" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} /><input
							type="hidden"
							name="documentId"
							value={document.id}
						/><input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:document-review:${index}`}
						/><label for={`document-decision-${index}`}
							>{translate(uiLocale, 'admin.requests.documentDecision')}</label
						><select id={`document-decision-${index}`} name="decision"
							><option value="approve"
								>{translate(uiLocale, 'admin.requests.documentApprove')}</option
							><option value="reject"
								>{translate(uiLocale, 'admin.requests.documentReject')}</option
							></select
						><label for={`document-reason-${index}`}
							>{translate(uiLocale, 'admin.requests.safeReason')}</label
						><textarea
							id={`document-reason-${index}`}
							name="reason"
							required
							maxlength="500"
						></textarea><label class="checkbox"
							><input
								type="checkbox"
								name="confirmation"
								value="confirmed"
								required
							/><span>{translate(uiLocale, 'admin.requests.confirm')}</span></label
						><button type="submit"
							>{translate(uiLocale, 'admin.requests.documentApply')}</button
						>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
