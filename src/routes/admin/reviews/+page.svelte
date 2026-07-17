<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.reviews.title')}</h2>
	<p>{translate('de', 'admin.reviews.typedNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="review-q">{translate('de', 'admin.search')}</label>
		<input id="review-q" name="q" value={data.query.q} maxlength="160" />
		<label for="review-kind">{translate('de', 'admin.kind')}</label>
		<input id="review-kind" name="kind" value={data.query.kind} maxlength="80" />
		<label for="review-status">{translate('de', 'admin.status')}</label>
		<select id="review-status" name="status" value={data.query.status}>
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="open">{translateAdminCode('de', 'open')}</option><option
				value="in_progress">{translateAdminCode('de', 'in_progress')}</option
			>
			<option value="resolved">{translateAdminCode('de', 'resolved')}</option><option
				value="dismissed">{translateAdminCode('de', 'dismissed')}</option
			>
		</select>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.reviews.items.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.reviews.items as task, index}
			<article class="admin-card">
				<p class="item-kicker">{task.kind} · {translateAdminCode('de', task.status)}</p>
				<h3>{task.reason_code}</h3>
				<p>{task.safe_summary}</p>
				<p><code>{task.source_kind}:{task.source_id}</code></p>
				{#if task.status === 'open' || task.status === 'in_progress'}
					{#if task.kind === 'family_correction' && task.source_kind === 'child_correction'}
						<form
							method="POST"
							action="?/decideChildCorrection"
							class="admin-action-form"
						>
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="taskId" value={task.id} />
							<input type="hidden" name="correctionId" value={task.source_id} />
							<input
								type="hidden"
								name="idempotencyKey"
								value={`${data.commandKey}:child:${index}`}
							/>
							<label for={`child-decision-${index}`}
								>{translate('de', 'admin.decision')}</label
							>
							<select id={`child-decision-${index}`} name="decision"
								><option value="approve">{translate('de', 'admin.approve')}</option
								><option value="reject">{translate('de', 'admin.reject')}</option
								></select
							>
							<label for={`child-reason-${index}`}
								>{translate('de', 'admin.reason')}</label
							>
							<textarea
								id={`child-reason-${index}`}
								name="reason"
								required
								maxlength="1000"
							></textarea>
							<label class="checkbox"
								><input
									type="checkbox"
									name="confirmation"
									value="confirmed"
									required
								/><span>{translate('de', 'admin.confirmAction')}</span></label
							>
							<button type="submit">{translate('de', 'admin.apply')}</button>
						</form>
					{:else if task.kind === 'family_name_match' || task.kind === 'family_claim_conflict'}
						<p>
							<a href="/admin/users"
								>{translate('de', 'admin.reviews.openFamilyTool')}</a
							>
						</p>
						<form
							method="POST"
							action="?/dismissFamilyReview"
							class="admin-action-form"
						>
							<input type="hidden" name="_csrf" value={data.csrfToken} />
							<input type="hidden" name="taskId" value={task.id} />
							<input
								type="hidden"
								name="decision"
								value={task.kind === 'family_name_match'
									? 'dismiss_name_match'
									: 'dismiss_claim_conflict'}
							/>
							<input
								type="hidden"
								name="idempotencyKey"
								value={`${data.commandKey}:review:${index}`}
							/>
							<label for={`review-reason-${index}`}
								>{translate('de', 'admin.reason')}</label
							>
							<textarea
								id={`review-reason-${index}`}
								name="reason"
								required
								maxlength="1000"
							></textarea>
							<label class="checkbox"
								><input
									type="checkbox"
									name="confirmation"
									value="confirmed"
									required
								/><span>{translate('de', 'admin.confirmAction')}</span></label
							>
							<button type="submit">{translate('de', 'admin.dismiss')}</button>
						</form>
					{:else if task.kind === 'course_mapping'}
						<p>
							<a href="/admin/catalog"
								>{translate('de', 'admin.reviews.openMappingTool')}</a
							>
						</p>
					{/if}
				{/if}
			</article>
		{/each}
	</div>
	<nav class="pagination" aria-label={translate('de', 'admin.pagination')}>
		{#if data.reviews.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${encodeURIComponent(data.query.kind)}&status=${data.query.status}&page=${data.reviews.page - 1}`}
				>{translate('de', 'admin.previous')}</a
			>{/if}
		{#if data.reviews.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${encodeURIComponent(data.query.kind)}&status=${data.query.status}&page=${data.reviews.page + 1}`}
				>{translate('de', 'admin.next')}</a
			>{/if}
	</nav>
</section>
