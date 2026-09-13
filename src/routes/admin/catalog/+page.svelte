<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.catalog.title')}</h2>
	<p>{translate(uiLocale, 'admin.catalog.noNotifications')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="catalog-q">{translate(uiLocale, 'admin.search')}</label>
		<input id="catalog-q" name="q" value={data.query.q} maxlength="160" />
		<label for="catalog-status">{translate(uiLocale, 'admin.status')}</label>
		<select id="catalog-status" name="status" value={data.query.status}>
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			<option value="draft">{translateAdminCode(uiLocale, 'draft')}</option><option
				value="published">{translateAdminCode(uiLocale, 'published')}</option
			>
			<option value="hidden">{translateAdminCode(uiLocale, 'hidden')}</option><option
				value="needs_review">{translateAdminCode(uiLocale, 'needs_review')}</option
			>
			<option value="retired">{translateAdminCode(uiLocale, 'retired')}</option>
		</select>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	<div class="admin-list">
		{#each data.catalog.items as course, index}
			<article class="admin-card">
				<p class="item-kicker">
					{translateAdminCode(uiLocale, course.lesson_kind)} · {translateAdminCode(uiLocale, course.catalog_status)} · {course.academic_period}
				</p>
				<h3>{course.display_name}</h3>
				<p>
					{course.subject} · {translate(uiLocale, 'admin.catalog.sessions')}: {course.session_count}
					· {translate(uiLocale, 'admin.catalog.mappings')}: {course.confirmed_mapping_count}
				</p>
				<p>
					{translate(uiLocale, 'admin.catalog.capacity')}: {course.capacity_override ??
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
							>{translate(uiLocale, 'admin.decision')}</label
						>
						<select id={`course-action-${index}`} name="action">
							<option value="publish"
								>{translate(uiLocale, 'admin.catalog.publish')}</option
							>
							<option value="hide">{translate(uiLocale, 'admin.catalog.hide')}</option>
							<option value="needs_review"
								>{translate(uiLocale, 'admin.catalog.needsReview')}</option
							>
							<option value="set_capacity"
								>{translate(uiLocale, 'admin.catalog.setCapacity')}</option
							>
						</select>
						<label for={`capacity-${index}`}
							>{translate(uiLocale, 'admin.catalog.capacityOptional')}</label
						>
						<input
							id={`capacity-${index}`}
							type="number"
							name="capacity"
							min="1"
							max="10000"
						/>
						<label for={`course-reason-${index}`}
							>{translate(uiLocale, 'admin.reason')}</label
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
							/><span>{translate(uiLocale, 'admin.confirmAction')}</span></label
						>
						<button type="submit">{translate(uiLocale, 'admin.apply')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
	<nav class="pagination" aria-label={translate(uiLocale, 'admin.pagination')}>
		{#if data.catalog.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.catalog.page - 1}`}
				>{translate(uiLocale, 'admin.previous')}</a
			>{/if}
		{#if data.catalog.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.catalog.page + 1}`}
				>{translate(uiLocale, 'admin.next')}</a
			>{/if}
	</nav>

	<h3>{translate(uiLocale, 'admin.catalog.mappingQueue')}</h3>
	{#if data.mappingQueue.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
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
						>{translate(uiLocale, 'admin.catalog.destinationCourse')}</label
					>
					<select id={`mapping-course-${index}`} name="courseGroupId" required>
						<option value="">{translate(uiLocale, 'admin.catalog.chooseCourse')}</option>
						{#each data.catalog.items.filter((course) => course.academic_period_id === mapping.academic_period_id) as course}
							<option value={course.id}
								>{course.display_name} · {course.subject}</option
							>
						{/each}
					</select>
					<label for={`mapping-decision-${index}`}
						>{translate(uiLocale, 'admin.decision')}</label
					>
					<select id={`mapping-decision-${index}`} name="decision"
						><option value="confirm">{translate(uiLocale, 'admin.approve')}</option><option
							value="reject">{translate(uiLocale, 'admin.reject')}</option
						></select
					>
					<label for={`mapping-reason-${index}`}>{translate(uiLocale, 'admin.reason')}</label>
					<textarea id={`mapping-reason-${index}`} name="reason" required maxlength="1000"
					></textarea>
					<label class="checkbox"
						><input
							type="checkbox"
							name="confirmation"
							value="confirmed"
							required
						/><span>{translate(uiLocale, 'admin.confirmAction')}</span></label
					>
					<button type="submit">{translate(uiLocale, 'admin.apply')}</button>
				</form>
			</article>
		{/each}
	</div>
</section>
