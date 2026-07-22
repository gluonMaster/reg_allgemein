<script lang="ts">
	import '../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const status = (value: string) =>
		translate('de', `contract.status.${value}` as 'contract.status.draft');
</script>

<svelte:head><title>{translate('de', 'contract.detail.title')}</title></svelte:head>

<main class="contract-shell">
	<nav><a href="/cabinet">{translate('de', 'contract.back')}</a></nav>
	<h1>{translate('de', 'contract.detail.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<section class="cabinet-card">
		<p class="item-kicker">{status(data.offer.status)}</p>
		<h2>{data.offer.contractNumber}</h2>
		<p>{data.offer.childName} · {data.offer.contractKind}</p>
		<p>{data.offer.effectiveFrom}{data.offer.effectiveTo ? `–${data.offer.effectiveTo}` : ''}</p>
		{#if data.offer.artifacts.length}
			<h3>{translate('de', 'contract.artifacts')}</h3>
			<ul>
				{#each data.offer.artifacts as artifact}
					<li><a href={`/contracts/artifacts/${artifact.id}/download`}>{translate('de', `contract.artifact.${artifact.kind}` as 'contract.artifact.offer_pdf')}</a> · SHA-256 {artifact.shortHash}…</li>
				{/each}
			</ul>
		{/if}
		{#if data.offer.status === 'sent' && data.offer.contractHash}
			<p class="notice-card">{translate('de', 'contract.acceptance.notice')}</p>
			<div class="contract-actions">
				<form method="POST" action="?/accept">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input type="hidden" name="expectedContractHash" value={data.offer.contractHash} />
					<input type="hidden" name="idempotencyKey" value={`accept:${data.offer.id}:${data.offer.contractHash}`} />
					<button type="submit">{translate('de', 'contract.accept')}</button>
				</form>
				<form method="POST" action="?/decline">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input type="hidden" name="expectedContractHash" value={data.offer.contractHash} />
					<input type="hidden" name="idempotencyKey" value={`decline:${data.offer.id}:${data.offer.contractHash}`} />
					<button class="secondary-button" type="submit">{translate('de', 'contract.decline')}</button>
				</form>
			</div>
		{/if}
		{#if data.offer.contractId && data.offer.operationalStatus === 'active'}
			<h3>{translate('de', 'contract.end.title')}</h3>
			<p>{translate('de', 'contract.end.notice')}</p>
			<form class="admin-action-form" method="POST" action="?/end">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="contractId" value={data.offer.contractId} />
				<input type="hidden" name="idempotencyKey" value={data.endIdempotencyKey} />
				<label>{translate('de', 'contract.end.kind')}
					<select name="kind" required>
						<option value="ordinary_termination">{translate('de', 'contract.end.ordinary')}</option>
						<option value="extraordinary_termination">{translate('de', 'contract.end.extraordinary')}</option>
						<option value="mutual_termination_request">{translate('de', 'contract.end.mutual')}</option>
						{#if data.offer.distanceLegalProfile === 'widerruf_applicable'}
							<option value="withdrawal">{translate('de', 'contract.end.withdrawal')}</option>
						{/if}
					</select>
				</label>
				<label>{translate('de', 'contract.end.requestedDate')}<input type="date" name="requestedEffectiveOn" /></label>
				<button type="submit">{translate('de', 'contract.end.submit')}</button>
			</form>
			{#if data.offer.contractKind === 'individual_hourly' || data.offer.contractKind === 'nachhilfe_hourly'}
				<h3>{translate('de', 'contract.attendance.title')}</h3>
				<p>{translate('de', 'contract.attendance.notice')}</p>
				<form method="POST" action="?/attendance">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input type="hidden" name="contractId" value={data.offer.contractId} />
					<input type="hidden" name="idempotencyKey" value={data.attendanceIdempotencyKey} />
					<button type="submit">{translate('de', 'contract.attendance.submit')}</button>
				</form>
			{/if}
		{/if}
		{#if data.offer.mediaContactVersionId}
			<h3>{translate('de', 'contract.media.title')}</h3>
			<p>{translate('de', 'contract.media.notice')}</p>
			<form class="admin-action-form" method="POST" action="?/mediaDecline">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="childId" value={data.offer.childId} />
				<input type="hidden" name="withdrawalContactVersionId" value={data.offer.mediaContactVersionId} />
				<input type="hidden" name="idempotencyKey" value={data.mediaIdempotencyKey} />
				<fieldset><legend>{translate('de', 'contract.media.capture')}</legend>
					<label class="checkbox"><input type="checkbox" name="captureScopes" value="photo" /> Foto</label>
					<label class="checkbox"><input type="checkbox" name="captureScopes" value="video" /> Video</label>
				</fieldset>
				<fieldset><legend>{translate('de', 'contract.media.channels')}</legend>
					<label class="checkbox"><input type="checkbox" name="publicationChannels" value="website" /> Website</label>
					<label class="checkbox"><input type="checkbox" name="publicationChannels" value="social_media" /> Social Media</label>
					<label class="checkbox"><input type="checkbox" name="publicationChannels" value="print" /> Print</label>
				</fieldset>
				<button class="secondary-button" type="submit">{translate('de', 'contract.media.decline')}</button>
			</form>
		{/if}
	</section>
</main>
