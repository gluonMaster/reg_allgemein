<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.users.title')}</h2>
	<p>{translate(uiLocale, 'admin.users.safeListNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="user-q">{translate(uiLocale, 'admin.search')}</label>
		<input id="user-q" name="q" value={data.query.q} maxlength="160" />
		<label for="user-status">{translate(uiLocale, 'admin.status')}</label>
		<select id="user-status" name="status" value={data.query.status}>
			<option value="">{translate(uiLocale, 'admin.all')}</option>
			<option value="active">{translateAdminCode(uiLocale, 'active')}</option><option
				value="deletion_requested">{translateAdminCode(uiLocale, 'deletion_requested')}</option
			><option value="closed">{translateAdminCode(uiLocale, 'closed')}</option>
		</select>
		<button type="submit">{translate(uiLocale, 'admin.filter')}</button>
	</form>
	{#if data.users.items.length === 0}<p>{translate(uiLocale, 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate(uiLocale, 'admin.name')}</th><th
						>{translate(uiLocale, 'admin.emailMask')}</th
					><th>{translate(uiLocale, 'admin.familyId')}</th><th
						>{translate(uiLocale, 'admin.children')}</th
					><th>{translate(uiLocale, 'admin.status')}</th></tr
				></thead
			>
			<tbody
				>{#each data.users.items as user}
					<tr>
						<td
							><a href={`/admin/users/${user.id}`}
								>{user.first_name} {user.last_name}</a
							></td
						>
						<td>{user.maskedEmail}</td><td>{user.family_display_id ?? '—'}</td>
						<td>{user.child_count}</td><td
							>{translateAdminCode(uiLocale, user.account_status)}{user.is_blocked
								? ` · ${translateAdminCode(uiLocale, 'blocked')}`
								: ''}</td
						>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate(uiLocale, 'admin.pagination')}>
		{#if data.users.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.users.page - 1}`}
				>{translate(uiLocale, 'admin.previous')}</a
			>{/if}
		{#if data.users.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.users.page + 1}`}
				>{translate(uiLocale, 'admin.next')}</a
			>{/if}
	</nav>
</section>
