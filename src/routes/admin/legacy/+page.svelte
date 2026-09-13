<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.legacy.title')}</h2>
	<p>{translate(uiLocale, 'admin.legacy.safeListNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="legacy-q">{translate(uiLocale, 'admin.search')}</label>
		<input id="legacy-q" name="q" value={data.query.q} maxlength="160" />
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.families.items.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate(uiLocale, 'admin.familyId')}</th><th
						>{translate(uiLocale, 'admin.ownership')}</th
					><th>{translate(uiLocale, 'admin.children')}</th><th
						>{translate(uiLocale, 'admin.emailMask')}</th
					><th>{translate(uiLocale, 'admin.status')}</th></tr
				></thead
			>
			<tbody
				>{#each data.families.items as family}
					<tr>
						<td
							><a href={`/admin/legacy/${family.id}`}>{family.display_family_id}</a
							></td
						>
						<td>{translateAdminCode(uiLocale, family.ownership)}</td><td
							>{family.child_count}</td
						>
						<td>{family.maskedEmails.join(', ') || '—'}</td>
						<td
							>{translateAdminCode(uiLocale, family.numbering_status)} · {translateAdminCode(uiLocale,
								family.continuity_status
							)}</td
						>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate(uiLocale, 'admin.pagination')}>
		{#if data.families.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&page=${data.families.page - 1}`}
				>{translate(uiLocale, 'admin.previous')}</a
			>{/if}
		{#if data.families.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&page=${data.families.page + 1}`}
				>{translate(uiLocale, 'admin.next')}</a
			>{/if}
	</nav>
</section>
