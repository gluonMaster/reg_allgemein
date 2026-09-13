<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const availabilityKeys = {
		available: 'catalog.availability.available',
		full: 'catalog.availability.full',
		unknown: 'catalog.availability.unknown',
		requires_admin_review: 'catalog.availability.requires_admin_review',
	} as const;
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.trials.title')}</h2>
	<p>{translate(uiLocale, 'admin.trials.dateNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="trial-q">{translate(uiLocale, 'admin.search')}</label><input id="trial-q" name="q" value={data.query.q} maxlength="160" />
		<label for="trial-status">{translate(uiLocale, 'admin.status')}</label>
		<select id="trial-status" name="status" value={data.query.status}>
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			{#each ['requested', 'confirmed', 'rejected', 'cancelled', 'attended', 'no_show', 'converted'] as status}<option value={status}>{translateAdminCode(uiLocale, status)}</option>{/each}
		</select>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.trials.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.trials as trial, index}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode(uiLocale, trial.status)} · {translate(uiLocale, availabilityKeys[trial.availability_at_request])}</p>
				<h3>{trial.course_name}</h3>
				<p>{trial.child_name}</p>
				<p>{translateAdminCode(uiLocale, trial.day_code)} {trial.start_time} · {trial.location_display}</p>
				<p>{translate(uiLocale, 'admin.trials.requestedDate')}: {trial.requested_date}{trial.confirmed_date ? ` · ${translate(uiLocale, 'admin.trials.confirmedDate')}: ${trial.confirmed_date}` : ''}</p>
				{#if ['requested', 'confirmed', 'attended'].includes(trial.status)}
					<form method="POST" action="?/transition" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="trialId" value={trial.id} />
						<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:trial:${index}`} />
						<label for={`trial-action-${index}`}>{translate(uiLocale, 'admin.decision')}</label>
						<select id={`trial-action-${index}`} name="action">
							{#if trial.status === 'requested'}<option value="confirm">{translate(uiLocale, 'admin.trials.confirm')}</option><option value="reject">{translate(uiLocale, 'admin.reject')}</option><option value="cancel">{translate(uiLocale, 'admin.trials.cancel')}</option>{/if}
							{#if trial.status === 'confirmed'}<option value="attended">{translate(uiLocale, 'admin.trials.attended')}</option><option value="no_show">{translate(uiLocale, 'admin.trials.noShow')}</option><option value="cancel">{translate(uiLocale, 'admin.trials.cancel')}</option>{/if}
							{#if trial.status === 'attended'}<option value="convert">{translate(uiLocale, 'admin.trials.convert')}</option>{/if}
						</select>
						{#if trial.status === 'requested'}
							<label for={`trial-session-${index}`}>{translate(uiLocale, 'trial.session')}</label>
							<select id={`trial-session-${index}`} name="sessionId">
								{#each data.sessions.filter((session) => session.course_group_id === trial.course_group_id) as session}<option value={session.id} selected={session.id === trial.session_id}>{translateAdminCode(uiLocale, session.day_code)} {session.start_time}–{session.end_time} · {session.location_display}</option>{/each}
							</select>
							<label for={`trial-date-${index}`}>{translate(uiLocale, 'admin.trials.confirmedDate')}</label><input id={`trial-date-${index}`} name="confirmedDate" type="date" />
						{/if}
						<label for={`trial-reason-${index}`}>{translate(uiLocale, 'admin.reason')}</label><textarea id={`trial-reason-${index}`} name="reason" required maxlength="1000"></textarea>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate(uiLocale, 'admin.confirmAction')}</span></label>
						<button type="submit">{translate(uiLocale, 'admin.apply')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
