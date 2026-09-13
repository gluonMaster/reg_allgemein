<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translatePrivacyCategory, translatePrivacyStatus } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.privacy.title')}</h2>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.privacy.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<section class="admin-card">
		<h3>{translate(uiLocale, 'privacy.export.title')}</h3>
		<form method="POST" action="?/createExport" class="admin-action-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:privacy-export`} />
			<label for="subject-user-id">{translate(uiLocale, 'admin.privacy.subjectUserId')}</label>
			<input id="subject-user-id" name="subjectUserId" required />
			<button type="submit">{translate(uiLocale, 'admin.privacy.createExport')}</button>
		</form>
	</section>

	<div class="admin-list">
		{#each data.requests as request, index}
			<article class="admin-card">
				<p class="item-kicker">{request.public_reference}</p>
				<h3>{translatePrivacyStatus(uiLocale, request.status)}</h3>
				<p>{translate(uiLocale, request.kind === 'delete' ? 'privacy.kind.delete' : 'privacy.kind.export')} · {request.created_at}</p>
				{#if request.safeSummary?.retainedCategories?.length}
					<h4>{translate(uiLocale, 'privacy.delete.retained')}</h4>
					<ul>{#each request.safeSummary.retainedCategories as item}<li>{translatePrivacyCategory(uiLocale, item.category)}: {item.count}</li>{/each}</ul>
					<p>{translate(uiLocale, 'privacy.delete.retentionNotice')}</p>
				{/if}
				{#if request.safeSummary?.holds?.length}
					<h4>{translate(uiLocale, 'privacy.delete.holds')}</h4>
					<ul>{#each request.safeSummary.holds as item}<li>{translatePrivacyCategory(uiLocale, item.category)}: {item.count}</li>{/each}</ul>
				{/if}
				{#if request.artifact_id && request.artifact_expires_at && request.artifact_expires_at > data.now}
					<p><a href={`/admin/privacy/exports/${request.artifact_id}/download`}>{translate(uiLocale, 'privacy.export.download')}</a></p>
				{/if}
				{#if request.kind === 'delete' && ['requested', 'reviewing', 'approved'].includes(request.status)}
					<form method="POST" action="?/processDelete" class="admin-action-form danger-card">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="privacyRequestId" value={request.id} />
						<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:privacy-delete:${index}`} />
						<label for={`privacy-reason-${index}`}>{translate(uiLocale, 'admin.reason')}</label>
						<textarea id={`privacy-reason-${index}`} name="reason" required maxlength="1000"></textarea>
						<label class="checkbox">
							<input type="checkbox" name="confirmation" value="confirmed" required />
							<span>{translate(uiLocale, 'admin.privacy.confirmDelete')}</span>
						</label>
						<button type="submit">{translate(uiLocale, 'admin.privacy.processDelete')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
