<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.imports.title')}</h2>
	<p>{translate('de', 'admin.imports.safeNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="import-q">{translate('de', 'admin.search')}</label>
		<input id="import-q" name="q" value={data.query.q} maxlength="160" />
		<label for="import-kind">{translate('de', 'admin.kind')}</label>
		<select id="import-kind" name="kind" value={data.query.kind}>
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="access">Access</option>
			<option value="plusbtext">PlusBText</option>
			<option value="price">Price</option>
			<option value="schedule">Schedule</option>
		</select>
		<label for="import-status">{translate('de', 'admin.status')}</label>
		<select id="import-status" name="status" value={data.query.status}>
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="staged">{translateAdminCode('de', 'staged')}</option>
			<option value="validated">{translateAdminCode('de', 'validated')}</option>
			<option value="promoted">{translateAdminCode('de', 'promoted')}</option>
			<option value="failed">{translateAdminCode('de', 'failed')}</option>
		</select>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.runs.items.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr>
					<th>{translate('de', 'admin.kind')}</th>
					<th>{translate('de', 'admin.period')}</th>
					<th>{translate('de', 'admin.status')}</th>
					<th>{translate('de', 'admin.imports.rows')}</th>
					<th>{translate('de', 'admin.imports.issues')}</th>
					<th>{translate('de', 'admin.date')}</th>
				</tr></thead
			>
			<tbody
				>{#each data.runs.items as run}
					<tr>
						<td><a href={`/admin/imports/${run.id}`}>{run.source_kind}</a></td>
						<td>{run.academic_period}</td><td>{translateAdminCode('de', run.status)}</td
						>
						<td>{run.rows_promoted}/{run.rows_total}</td>
						<td>{run.open_issue_count}</td><td>{run.started_at}</td>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate('de', 'admin.pagination')}>
		{#if data.runs.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${data.query.kind}&status=${data.query.status}&page=${data.runs.page - 1}`}
				>{translate('de', 'admin.previous')}</a
			>{/if}
		{#if data.runs.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&kind=${data.query.kind}&status=${data.query.status}&page=${data.runs.page + 1}`}
				>{translate('de', 'admin.next')}</a
			>{/if}
	</nav>
</section>
