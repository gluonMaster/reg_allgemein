<script lang="ts">
	import '../../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate('de', 'trial.title')}</title></svelte:head>

<main class="auth-shell trial-shell">
	<nav class="auth-nav"><a href="/catalog">{translate('de', 'trial.backToCatalog')}</a><a href="/cabinet">{translate('de', 'cabinet.link.cabinet')}</a></nav>
	<h1>{translate('de', 'trial.title')}</h1>
	<h2>{data.trial.course.displayName}</h2>
	<p>{translate('de', 'trial.dateNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	{#if data.trial.children.length === 0}
		<p>{translate('de', 'trial.childRequired')}</p>
		<a href="/cabinet">{translate('de', 'trial.addChild')}</a>
	{:else}
		<form method="POST" action="?/submit">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.commandKey} />
			<label for="trial-child">{translate('de', 'trial.child')}</label>
			<select id="trial-child" name="childId" required>
				<option value="">{translate('de', 'trial.chooseChild')}</option>
				{#each data.trial.children as child}<option value={child.id}>{child.fullName} · {child.birthDate}</option>{/each}
			</select>
			<label for="trial-session">{translate('de', 'trial.session')}</label>
			<select id="trial-session" name="sessionId" required>
				<option value="">{translate('de', 'trial.chooseSession')}</option>
				{#each data.trial.sessions as session}<option value={session.id}>{session.dayCode} {session.startTime}–{session.endTime} · {session.teacherName} · {session.locationDisplay}</option>{/each}
			</select>
			<label for="trial-date">{translate('de', 'trial.proposedDate')}</label>
			<input id="trial-date" name="requestedDate" type="date" min={data.minimumDate} required />
			<button type="submit">{translate('de', 'trial.submit')}</button>
		</form>
	{/if}
</main>

