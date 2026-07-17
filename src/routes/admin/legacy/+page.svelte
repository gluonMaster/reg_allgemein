<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.legacy.title')}</h2>
	<p>{translate('de', 'admin.legacy.safeListNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="legacy-q">{translate('de', 'admin.search')}</label>
		<input id="legacy-q" name="q" value={data.query.q} maxlength="160" />
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.families.items.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate('de', 'admin.familyId')}</th><th
						>{translate('de', 'admin.ownership')}</th
					><th>{translate('de', 'admin.children')}</th><th
						>{translate('de', 'admin.emailMask')}</th
					><th>{translate('de', 'admin.status')}</th></tr
				></thead
			>
			<tbody
				>{#each data.families.items as family}
					<tr>
						<td
							><a href={`/admin/legacy/${family.id}`}>{family.display_family_id}</a
							></td
						>
						<td>{translateAdminCode('de', family.ownership)}</td><td
							>{family.child_count}</td
						>
						<td>{family.maskedEmails.join(', ') || '—'}</td>
						<td
							>{translateAdminCode('de', family.numbering_status)} · {translateAdminCode(
								'de',
								family.continuity_status
							)}</td
						>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate('de', 'admin.pagination')}>
		{#if data.families.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&page=${data.families.page - 1}`}
				>{translate('de', 'admin.previous')}</a
			>{/if}
		{#if data.families.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&page=${data.families.page + 1}`}
				>{translate('de', 'admin.next')}</a
			>{/if}
	</nav>
</section>
