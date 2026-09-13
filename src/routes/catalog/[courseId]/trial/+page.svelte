<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { translateAdminCode } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{translate(uiLocale, 'trial.title')}</title></svelte:head>

<main class="auth-shell trial-shell">
	<nav class="auth-nav"><a href="/catalog">{translate(uiLocale, 'trial.backToCatalog')}</a><a href="/cabinet">{translate(uiLocale, 'cabinet.link.cabinet')}</a></nav>
	<h1>{translate(uiLocale, 'trial.title')}</h1>
	<h2>{data.trial.course.displayName}</h2>
	<p>{translate(uiLocale, 'trial.dateNotice')}</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	{#if data.trial.children.length === 0}
		<p>{translate(uiLocale, 'trial.childRequired')}</p>
		<a href="/cabinet">{translate(uiLocale, 'trial.addChild')}</a>
	{:else}
		<form method="POST" action="?/submit">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.commandKey} />
			<label for="trial-child">{translate(uiLocale, 'trial.child')}</label>
			<select id="trial-child" name="childId" required>
				<option value="">{translate(uiLocale, 'trial.chooseChild')}</option>
				{#each data.trial.children as child}<option value={child.id}>{child.fullName} · {child.birthDate}</option>{/each}
			</select>
			<label for="trial-session">{translate(uiLocale, 'trial.session')}</label>
			<select id="trial-session" name="sessionId" required>
				<option value="">{translate(uiLocale, 'trial.chooseSession')}</option>
				{#each data.trial.sessions as session}<option value={session.id}>{translateAdminCode(uiLocale, session.dayCode)} {session.startTime}–{session.endTime} · {session.teacherName} · {session.locationDisplay}</option>{/each}
			</select>
			<label for="trial-date">{translate(uiLocale, 'trial.proposedDate')}</label>
			<input id="trial-date" name="requestedDate" type="date" min={data.minimumDate} required />
			<button type="submit">{translate(uiLocale, 'trial.submit')}</button>
		</form>
	{/if}
</main>

