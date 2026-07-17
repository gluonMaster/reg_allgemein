<script lang="ts">
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
	<h2>{translate('de', 'admin.trials.title')}</h2>
	<p>{translate('de', 'admin.trials.dateNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<form class="filter-bar" method="GET">
		<label for="trial-q">{translate('de', 'admin.search')}</label><input id="trial-q" name="q" value={data.query.q} maxlength="160" />
		<label for="trial-status">{translate('de', 'admin.status')}</label>
		<select id="trial-status" name="status" value={data.query.status}>
			<option value="">{translate('de', 'admin.all')}</option>
			{#each ['requested', 'confirmed', 'rejected', 'cancelled', 'attended', 'no_show', 'converted'] as status}<option value={status}>{translateAdminCode('de', status)}</option>{/each}
		</select>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.trials.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-list">
		{#each data.trials as trial, index}
			<article class="admin-card">
				<p class="item-kicker">{translateAdminCode('de', trial.status)} · {translate('de', availabilityKeys[trial.availability_at_request])}</p>
				<h3>{trial.course_name}</h3>
				<p>{trial.child_name}</p>
				<p>{trial.day_code} {trial.start_time} · {trial.location_display}</p>
				<p>{translate('de', 'admin.trials.requestedDate')}: {trial.requested_date}{trial.confirmed_date ? ` · ${translate('de', 'admin.trials.confirmedDate')}: ${trial.confirmed_date}` : ''}</p>
				{#if ['requested', 'confirmed', 'attended'].includes(trial.status)}
					<form method="POST" action="?/transition" class="admin-action-form">
						<input type="hidden" name="_csrf" value={data.csrfToken} />
						<input type="hidden" name="trialId" value={trial.id} />
						<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:trial:${index}`} />
						<label for={`trial-action-${index}`}>{translate('de', 'admin.decision')}</label>
						<select id={`trial-action-${index}`} name="action">
							{#if trial.status === 'requested'}<option value="confirm">{translate('de', 'admin.trials.confirm')}</option><option value="reject">{translate('de', 'admin.reject')}</option><option value="cancel">{translate('de', 'admin.trials.cancel')}</option>{/if}
							{#if trial.status === 'confirmed'}<option value="attended">{translate('de', 'admin.trials.attended')}</option><option value="no_show">{translate('de', 'admin.trials.noShow')}</option><option value="cancel">{translate('de', 'admin.trials.cancel')}</option>{/if}
							{#if trial.status === 'attended'}<option value="convert">{translate('de', 'admin.trials.convert')}</option>{/if}
						</select>
						{#if trial.status === 'requested'}
							<label for={`trial-session-${index}`}>{translate('de', 'trial.session')}</label>
							<select id={`trial-session-${index}`} name="sessionId">
								{#each data.sessions.filter((session) => session.course_group_id === trial.course_group_id) as session}<option value={session.id} selected={session.id === trial.session_id}>{session.day_code} {session.start_time}–{session.end_time} · {session.location_display}</option>{/each}
							</select>
							<label for={`trial-date-${index}`}>{translate('de', 'admin.trials.confirmedDate')}</label><input id={`trial-date-${index}`} name="confirmedDate" type="date" />
						{/if}
						<label for={`trial-reason-${index}`}>{translate('de', 'admin.reason')}</label><textarea id={`trial-reason-${index}`} name="reason" required maxlength="1000"></textarea>
						<label class="checkbox"><input type="checkbox" name="confirmation" value="confirmed" required /><span>{translate('de', 'admin.confirmAction')}</span></label>
						<button type="submit">{translate('de', 'admin.apply')}</button>
					</form>
				{/if}
			</article>
		{/each}
	</div>
</section>
