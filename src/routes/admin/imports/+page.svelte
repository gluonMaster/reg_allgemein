<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.imports.title')}</h2>
	<p>{translate(uiLocale, 'admin.imports.safeNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="import-q">{translate(uiLocale, 'admin.search')}</label>
		<input id="import-q" name="q" value={data.query.q} maxlength="160" />
		<label for="import-kind">{translate(uiLocale, 'admin.kind')}</label>
		<select id="import-kind" name="kind" value={data.query.kind}>
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			<option value="access">Access</option>
			<option value="plusbtext">PlusBText</option>
			<option value="price">{translate(uiLocale, 'ui.import.price')}</option>
			<option value="schedule">{translate(uiLocale, 'ui.import.schedule')}</option>
		</select>
		<label for="import-status">{translate(uiLocale, 'admin.status')}</label>
		<select id="import-status" name="status" value={data.query.status}>
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			<option value="staged">{translateAdminCode(uiLocale, 'staged')}</option>
			<option value="validated">{translateAdminCode(uiLocale, 'validated')}</option>
			<option value="promoted">{translateAdminCode(uiLocale, 'promoted')}</option>
			<option value="failed">{translateAdminCode(uiLocale, 'failed')}</option>
		</select>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.runs.items.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr>
					<th>{translate(uiLocale, 'admin.kind')}</th>
					<th>{translate(uiLocale, 'admin.period')}</th>
					<th>{translate(uiLocale, 'admin.status')}</th>
					<th>{translate(uiLocale, 'admin.imports.rows')}</th>
					<th>{translate(uiLocale, 'admin.imports.issues')}</th>
					<th>{translate(uiLocale, 'admin.date')}</th>
				</tr></thead
			>
			<tbody
				>{#each data.runs.items as run}
					<tr>
						<td><a href={`/admin/imports/${run.id}`}>{translateAdminCode(uiLocale, run.source_kind)}</a></td>
						<td>{run.academic_period}</td><td>{translateAdminCode(uiLocale, run.status)}</td
						>
						<td>{run.rows_promoted}/{run.rows_total}</td>
						<td>{run.open_issue_count}</td><td>{run.started_at}</td>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate(uiLocale, 'admin.pagination')}>
		{#if data.runs.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${data.query.kind}&status=${data.query.status}&page=${data.runs.page - 1}`}
				>{translate(uiLocale, 'admin.previous')}</a
			>{/if}
		{#if data.runs.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${data.query.kind}&status=${data.query.status}&page=${data.runs.page + 1}`}
				>{translate(uiLocale, 'admin.next')}</a
			>{/if}
	</nav>
</section>
