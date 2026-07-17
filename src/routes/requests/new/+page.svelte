<script lang="ts">
	import '../../../app.css';
	import type { ActionData, PageData } from './$types';
	import { formatMessage, translate } from '$lib/i18n';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
</script>

<svelte:head><title>{translate('de', 'request.new.title')}</title></svelte:head>

<main class="request-shell">
	<nav class="auth-nav"><a href="/catalog">{translate('de', 'request.link.catalog')}</a><a href="/cabinet">{translate('de', 'request.link.cabinet')}</a></nav>
	<h1>{translate('de', data.requestKind === 'nachhilfe' ? 'request.new.nachhilfe' : 'request.new.individual')}</h1>
	<p>
		{data.requestKind === 'nachhilfe'
			? formatMessage('de', 'request.rate.funded', { amount: euro.format(data.page.fundedNachhilfeRateCents / 100) })
			: formatMessage('de', 'request.rate.individual', { amount: euro.format(data.page.individualRateCents / 100) })}
	</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	{#if data.page.children.length === 0}
		<p>{translate('de', 'request.childRequired')}</p>
		<a href="/cabinet">{translate('de', 'request.childAdd')}</a>
	{:else}
		<form method="POST" action="?/create" class="request-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.commandKey} />
			<input type="hidden" name="requestKind" value={data.requestKind} />
			<label for="request-child">{translate('de', 'request.child')}</label>
			<select id="request-child" name="childId" required>
				<option value="">{translate('de', 'request.choose')}</option>
				{#each data.page.children as child}<option value={child.id}>{child.fullName} · {child.birthDate}</option>{/each}
			</select>
			{#if data.requestKind === 'nachhilfe'}
				<label for="funding-kind">{translate('de', 'request.fundingKind')}</label>
				<select id="funding-kind" name="fundingKind" required>
					<option value="jobcenter">{translate('de', 'request.funding.jobcenter')}</option>
					<option value="socialamt">{translate('de', 'request.funding.socialamt')}</option>
				</select>
			{/if}
			<label for="subjects">{translate('de', 'request.subjects')}</label>
			<input id="subjects" name="subjects" required maxlength="500" />
			<label for="description">{translate('de', 'request.description')}</label>
			<textarea id="description" name="description" maxlength="2000"></textarea>
			<fieldset>
				<legend>{translate('de', 'request.preferredDays')}</legend>
				{#each ['MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as day}
					<label class="checkbox"><input type="checkbox" name="preferredDays" value={day} /><span>{translate('de', `request.day.${day}` as 'request.day.MO')}</span></label>
				{/each}
			</fieldset>
			<label for="preferred-format">{translate('de', 'request.preferredFormat')}</label>
			<select id="preferred-format" name="preferredFormat" required>
				<option value="onsite">{translate('de', 'request.format.onsite')}</option><option value="online">{translate('de', 'request.format.online')}</option><option value="mixed">{translate('de', 'request.format.mixed')}</option>
			</select>
			<label for="preferred-locations">{translate('de', 'request.preferredLocations')}</label>
			<textarea id="preferred-locations" name="preferredLocations" maxlength="1200"></textarea>
			<button type="submit">{translate('de', 'request.draftCreate')}</button>
		</form>
	{/if}
</main>
