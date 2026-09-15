<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../../app.css';
	import type { ActionData, PageData } from './$types';
	import { formatMessage, translate } from '$lib/i18n';
	import { formatCalendarDate } from '$lib/i18n/locale';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = $derived(new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', { style: 'currency', currency: 'EUR' }));
</script>

<svelte:head><title>{translate(uiLocale, 'request.new.title')}</title></svelte:head>

<main class="request-shell">
	<nav class="auth-nav"><a href="/catalog">{translate(uiLocale, 'request.link.catalog')}</a><a href="/cabinet">{translate(uiLocale, 'request.link.cabinet')}</a></nav>
	<h1>{translate(uiLocale, data.requestKind === 'nachhilfe' ? 'request.new.nachhilfe' : 'request.new.individual')}</h1>
	<p>
		{data.requestKind === 'nachhilfe'
			? formatMessage(uiLocale, 'request.rate.funded', { amount: euro.format(data.page.fundedNachhilfeRateCents / 100) })
			: formatMessage(uiLocale, 'request.rate.individual', { amount: euro.format(data.page.individualRateCents / 100) })}
	</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}
	{#if data.page.children.length === 0}
		<p>{translate(uiLocale, 'request.childRequired')}</p>
		<a href="/cabinet">{translate(uiLocale, 'request.childAdd')}</a>
	{:else}
		<form method="POST" action="?/create" class="request-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.commandKey} />
			<input type="hidden" name="requestKind" value={data.requestKind} />
			<label for="request-child">{translate(uiLocale, 'request.child')}</label>
			<select id="request-child" name="childId" required>
				<option value="">{translate(uiLocale, 'request.choose')}</option>
				{#each data.page.children as child}<option value={child.id}>{child.fullName} · {formatCalendarDate(uiLocale, child.birthDate)}</option>{/each}
			</select>
			{#if data.requestKind === 'nachhilfe'}
				<label for="funding-kind">{translate(uiLocale, 'request.fundingKind')}</label>
				<select id="funding-kind" name="fundingKind" required>
					<option value="jobcenter">{translate(uiLocale, 'request.funding.jobcenter')}</option>
					<option value="socialamt">{translate(uiLocale, 'request.funding.socialamt')}</option>
				</select>
			{/if}
			<label for="subjects">{translate(uiLocale, 'request.subjects')}</label>
			<input id="subjects" name="subjects" required maxlength="500" />
			<label for="description">{translate(uiLocale, 'request.description')}</label>
			<textarea id="description" name="description" maxlength="2000"></textarea>
			<fieldset>
				<legend>{translate(uiLocale, 'request.preferredDays')}</legend>
				{#each ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as day}
					<label class="checkbox"><input type="checkbox" name="preferredDays" value={day} /><span>{translate(uiLocale, `request.day.${day}` as 'request.day.MO')}</span></label>
				{/each}
			</fieldset>
			<label for="preferred-format">{translate(uiLocale, 'request.preferredFormat')}</label>
			<select id="preferred-format" name="preferredFormat" required>
				<option value="onsite">{translate(uiLocale, 'request.format.onsite')}</option><option value="online">{translate(uiLocale, 'request.format.online')}</option><option value="mixed">{translate(uiLocale, 'request.format.mixed')}</option>
			</select>
			<label for="preferred-locations">{translate(uiLocale, 'request.preferredLocations')}</label>
			<textarea id="preferred-locations" name="preferredLocations" maxlength="1200"></textarea>
			<button type="submit">{translate(uiLocale, 'request.draftCreate')}</button>
		</form>
	{/if}
</main>

<style>
	.request-form { max-width: 52rem; padding: 1.25rem; border: 1px solid #d9e3df; border-radius: .75rem; background: white; }
	.request-form input[name="subjects"], .request-form select { max-width: 36rem; }
	.request-form select[name="fundingKind"], .request-form select[name="preferredFormat"] { max-width: 24rem; }
	.request-form textarea { min-height: 7rem; }
	.request-form button { justify-self: start; }
</style>
