<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.catalog.title')}</h2>
	<p>{translate('de', 'admin.catalog.noNotifications')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="catalog-q">{translate('de', 'admin.search')}</label>
		<input id="catalog-q" name="q" value={data.query.q} maxlength="160" />
		<label for="catalog-status">{translate('de', 'admin.status')}</label>
		<select id="catalog-status" name="status" value={data.query.status}>
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="draft">{translateAdminCode('de', 'draft')}</option><option
				value="published">{translateAdminCode('de', 'published')}</option
			>
			<option value="hidden">{translateAdminCode('de', 'hidden')}</option><option
				value="needs_review">{translateAdminCode('de', 'needs_review')}</option
			>
			<option value="retired">{translateAdminCode('de', 'retired')}</option>
		</select>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	<div class="admin-list">
		{#each data.catalog.items as course, index}
			<article class="admin-card">
				<p class="item-kicker">
					{course.lesson_kind} · {translateAdminCode('de', course.catalog_status)} · {course.academic_period}
				</p>
				<h3>{course.display_name}</h3>
				<p>
					{course.subject} · {translate('de', 'admin.catalog.sessions')}: {course.session_count}
					· {translate('de', 'admin.catalog.mappings')}: {course.confirmed_mapping_count}
				</p>
				<p>
					{translate('de', 'admin.catalog.capacity')}: {course.capacity_override ??
						course.capacity_default ??
						'—'}
				</p>
				{#if course.catalog_status !== 'retired'}
					<form method="POST" action="?/updateCourse" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="courseGroupId" value={course.id} />
						<input
							type="hidden"
							name="idempotencyKey"
							value={`${data.commandKey}:course:${index}`}
						/>
						<label for={`course-action-${index}`}
							>{translate('de', 'admin.decision')}</label
						>
						<select id={`course-action-${index}`} name="action">
							<option value="publish"
								>{translate('de', 'admin.catalog.publish')}</option
							>
							<option value="hide">{translate('de', 'admin.catalog.hide')}</option>
							<option value="needs_review"
								>{translate('de', 'admin.catalog.needsReview')}</option
							>
							<option value="set_capacity"
								>{translate('de', 'admin.catalog.setCapacity')}</option
							>
						</select>
						<label for={`capacity-${index}`}
							>{translate('de', 'admin.catalog.capacityOptional')}</label
						>
						<input
							id={`capacity-${index}`}
							type="number"
							name="capacity"
							min="1"
							max="10000"
						/>
						<label for={`course-reason-${index}`}
							>{translate('de', 'admin.reason')}</label
						>
						<textarea
							id={`course-reason-${index}`}
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
				{/if}
			</article>
		{/each}
	</div>
	<nav class="pagination" aria-label={translate('de', 'admin.pagination')}>
		{#if data.catalog.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.catalog.page - 1}`}
				>{translate('de', 'admin.previous')}</a
			>{/if}
		{#if data.catalog.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.catalog.page + 1}`}
				>{translate('de', 'admin.next')}</a
			>{/if}
	</nav>

	<h3>{translate('de', 'admin.catalog.mappingQueue')}</h3>
	{#if data.mappingQueue.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.mappingQueue as mapping, index}
			<article class="admin-card">
				<h4>{mapping.group_name_raw}</h4>
				<form method="POST" action="?/decideMapping" class="admin-action-form">
					<input type="hidden" name="_csrf" value={data.csrfToken} />
					<input type="hidden" name="taskId" value={mapping.task_id ?? ''} />
					<input
						type="hidden"
						name="legacyEnrollmentId"
						value={mapping.legacy_enrollment_id}
					/>
					<input
						type="hidden"
						name="idempotencyKey"
						value={`${data.commandKey}:mapping:${index}`}
					/>
					<label for={`mapping-course-${index}`}
						>{translate('de', 'admin.catalog.destinationCourse')}</label
					>
					<select id={`mapping-course-${index}`} name="courseGroupId" required>
						<option value="">{translate('de', 'admin.catalog.chooseCourse')}</option>
						{#each data.catalog.items.filter((course) => course.academic_period_id === mapping.academic_period_id) as course}
							<option value={course.id}
								>{course.display_name} · {course.subject}</option
							>
						{/each}
					</select>
					<label for={`mapping-decision-${index}`}
						>{translate('de', 'admin.decision')}</label
					>
					<select id={`mapping-decision-${index}`} name="decision"
						><option value="confirm">{translate('de', 'admin.approve')}</option><option
							value="reject">{translate('de', 'admin.reject')}</option
						></select
					>
					<label for={`mapping-reason-${index}`}>{translate('de', 'admin.reason')}</label>
					<textarea id={`mapping-reason-${index}`} name="reason" required maxlength="1000"
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
			</article>
		{/each}
	</div>
</section>
