<script lang="ts">
	import { translate, translatePrivacyCategory, translatePrivacyStatus } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.privacy.title')}</h2>
	<p class="sensitive-notice">{translate('de', 'admin.privacy.notice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<section class="admin-card">
		<h3>{translate('de', 'privacy.export.title')}</h3>
		<form method="POST" action="?/createExport" class="admin-action-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:privacy-export`} />
			<label for="subject-user-id">{translate('de', 'admin.privacy.subjectUserId')}</label>
			<input id="subject-user-id" name="subjectUserId" required />
			<button type="submit">{translate('de', 'admin.privacy.createExport')}</button>
		</form>
	</section>

	<div class="admin-list">
		{#each data.requests as request, index}
			<article class="admin-card">
				<p class="item-kicker">{request.public_reference}</p>
				<h3>{translatePrivacyStatus('de', request.status)}</h3>
				<p>{translate('de', request.kind === 'delete' ? 'privacy.kind.delete' : 'privacy.kind.export')} · {request.created_at}</p>
				{#if request.safeSummary?.retainedCategories?.length}
					<h4>{translate('de', 'privacy.delete.retained')}</h4>
					<ul>{#each request.safeSummary.retainedCategories as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
					<p>{translate('de', 'privacy.delete.retentionNotice')}</p>
				{/if}
				{#if request.safeSummary?.holds?.length}
					<h4>{translate('de', 'privacy.delete.holds')}</h4>
					<ul>{#each request.safeSummary.holds as item}<li>{translatePrivacyCategory('de', item.category)}: {item.count}</li>{/each}</ul>
				{/if}
				{#if request.artifact_id && request.artifact_expires_at && request.artifact_expires_at > data.now}
					<p><a href={`/admin/privacy/exports/${request.artifact_id}/download`}>{translate('de', 'privacy.export.download')}</a></p>
				{/if}
				{#if request.kind === 'delete' && ['requested', 'reviewing', 'approved'].includes(request.status)}
					<form method="POST" action="?/processDelete" class="admin-action-form danger-card">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="privacyRequestId" value={request.id} />
						<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:privacy-delete:${index}`} />
						<label for={`privacy-reason-${index}`}>{translate('de', 'admin.reason')}</label>
						<textarea id={`privacy-reason-${index}`} name="reason" required maxlength="1000"></textarea>
						<label class="checkbox">
							<input type="checkbox" name="confirmation" value="confirmed" required />
							<span>{translate('de', 'admin.privacy.confirmDelete')}</span>
						</label>
						<button type="submit">{translate('de', 'admin.privacy.processDelete')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
