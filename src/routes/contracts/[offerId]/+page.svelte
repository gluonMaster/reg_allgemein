<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import EvidenceText from '$lib/components/EvidenceText.svelte';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const status = (value: string) =>
		translate(uiLocale, `contract.status.${value}` as 'contract.status.draft');
</script>

<svelte:head><title>{translate(uiLocale, 'contract.detail.title')}</title></svelte:head>

<main class="contract-shell">
	<nav><a href="/cabinet">{translate(uiLocale, 'contract.back')}</a></nav>
	<h1>{translate(uiLocale, 'contract.detail.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<section class="cabinet-card">
		<p class="item-kicker">{status(data.offer.status)}</p>
		<h2>{data.offer.contractNumber}</h2>
		<p>{data.offer.childName} · {translateAdminCode(uiLocale, data.offer.contractKind)}</p>
		<p>
			{data.offer.effectiveFrom}{data.offer.effectiveTo ? `–${data.offer.effectiveTo}` : ''}
		</p>
		{#if data.offer.artifacts.length}
			<h3>{translate(uiLocale, 'contract.artifacts')}</h3>
			<ul>
				{#each data.offer.artifacts as artifact}
					<li>
						<a href={`/contracts/artifacts/${artifact.id}/download`}
							>{translate(uiLocale,
								`contract.artifact.${artifact.kind}` as 'contract.artifact.offer_pdf'
							)}</a
						>
						· SHA-256 {artifact.shortHash}…
					</li>
				{/each}
			</ul>
		{/if}
		{#if data.offer.status === 'sent' && data.offer.contractHash}
			<p class="notice-card">{translate(uiLocale, 'contract.acceptance.notice')}</p>
			<div class="contract-actions">
				<form method="POST" action="?/accept">
					<p><EvidenceText messageKey={data.offer.paymentRequired ? 'contract.acceptance.payableText' : 'contract.acceptance.fundedText'} /></p>
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input
						type="hidden"
						name="expectedContractHash"
						value={data.offer.contractHash}
					/>
					<input
						type="hidden"
						name="idempotencyKey"
						value={`accept:${data.offer.id}:${data.offer.contractHash}`}
					/>
					<button type="submit"
						><EvidenceText messageKey={data.offer.paymentRequired ? 'contract.accept.payable' : 'contract.accept.funded'} /></button
					>
				</form>
				<form method="POST" action="?/decline">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input
						type="hidden"
						name="expectedContractHash"
						value={data.offer.contractHash}
					/>
					<input
						type="hidden"
						name="idempotencyKey"
						value={`decline:${data.offer.id}:${data.offer.contractHash}`}
					/>
					<button class="secondary-button" type="submit"
						>{translate(uiLocale, 'contract.decline')}</button
					>
				</form>
			</div>
		{/if}
		{#if data.offer.contractId && data.offer.operationalStatus === 'active'}
			<h3>{translate(uiLocale, 'contract.end.title')}</h3>
			<p>{translate(uiLocale, 'contract.end.notice')}</p>
			<form class="admin-action-form" method="POST" action="?/end">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="contractId" value={data.offer.contractId} />
				<input type="hidden" name="idempotencyKey" value={data.endIdempotencyKey} />
				<label
					>{translate(uiLocale, 'contract.end.kind')}
					<select name="kind" required>
						<option value="ordinary_termination"
							>{translate(uiLocale, 'contract.end.ordinary')}</option
						>
						<option value="extraordinary_termination"
							>{translate(uiLocale, 'contract.end.extraordinary')}</option
						>
						<option value="mutual_termination_request"
							>{translate(uiLocale, 'contract.end.mutual')}</option
						>
						{#if data.offer.distanceLegalProfile === 'widerruf_applicable'}
							<option value="withdrawal"
								>{translate(uiLocale, 'contract.end.withdrawal')}</option
							>
						{/if}
					</select>
				</label>
				<label
					>{translate(uiLocale, 'contract.end.requestedDate')}<input
						type="date"
						name="requestedEffectiveOn"
					/></label
				>
				<button type="submit">{translate(uiLocale, 'contract.end.submit')}</button>
			</form>
			{#if data.offer.contractKind === 'individual_hourly' || data.offer.contractKind === 'nachhilfe_hourly'}
				<h3>{translate(uiLocale, 'contract.attendance.title')}</h3>
				<p>{translate(uiLocale, 'contract.attendance.notice')}</p>
				<form method="POST" action="?/attendance">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input type="hidden" name="contractId" value={data.offer.contractId} />
					<input
						type="hidden"
						name="idempotencyKey"
						value={data.attendanceIdempotencyKey}
					/>
					<button type="submit">{translate(uiLocale, 'contract.attendance.submit')}</button>
				</form>
			{/if}
		{/if}
		{#if data.offer.mediaContactVersionId}
			<h3>{translate(uiLocale, 'contract.media.title')}</h3>
			<p>{translate(uiLocale, 'contract.media.notice')}</p>
			<form class="admin-action-form" method="POST" action="?/mediaDecline">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="childId" value={data.offer.childId} />
				<input
					type="hidden"
					name="withdrawalContactVersionId"
					value={data.offer.mediaContactVersionId}
				/>
				<input type="hidden" name="idempotencyKey" value={data.mediaIdempotencyKey} />
				<fieldset>
					<legend>{translate(uiLocale, 'contract.media.capture')}</legend>
					<label class="checkbox"
						><input type="checkbox" name="captureScopes" value="photo" /> {translate(uiLocale, 'ui.photo')}</label
					>
					<label class="checkbox"
						><input type="checkbox" name="captureScopes" value="video" /> {translate(uiLocale, 'ui.video')}</label
					>
				</fieldset>
				<fieldset>
					<legend>{translate(uiLocale, 'contract.media.channels')}</legend>
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
				<button class="secondary-button" type="submit"
					>{translate(uiLocale, 'contract.media.decline')}</button
				>
			</form>
		{/if}
	</section>
</main>
