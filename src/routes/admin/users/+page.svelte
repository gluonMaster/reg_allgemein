<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.users.title')}</h2>
	<p>{translate('de', 'admin.users.safeListNotice')}</p>
	<form class="filter-bar" method="GET">
		<label for="user-q">{translate('de', 'admin.search')}</label>
		<input id="user-q" name="q" value={data.query.q} maxlength="160" />
		<label for="user-status">{translate('de', 'admin.status')}</label>
		<select id="user-status" name="status" value={data.query.status}>
			<option value="">{translate('de', 'admin.all')}</option>
			<option value="active">{translateAdminCode('de', 'active')}</option><option
				value="deletion_requested">{translateAdminCode('de', 'deletion_requested')}</option
			><option value="closed">{translateAdminCode('de', 'closed')}</option>
		</select>
		<button type="submit">{translate('de', 'admin.filter')}</button>
	</form>
	{#if data.users.items.length === 0}<p>{translate('de', 'admin.empty')}</p>{/if}
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate('de', 'admin.name')}</th><th
						>{translate('de', 'admin.emailMask')}</th
					><th>{translate('de', 'admin.familyId')}</th><th
						>{translate('de', 'admin.children')}</th
					><th>{translate('de', 'admin.status')}</th></tr
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
							>{translateAdminCode('de', user.account_status)}{user.is_blocked
								? ` · ${translateAdminCode('de', 'blocked')}`
								: ''}</td
						>
					</tr>
				{/each}</tbody
			>
		</table>
	</div>
	<nav class="pagination" aria-label={translate('de', 'admin.pagination')}>
		{#if data.users.page > 1}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.users.page - 1}`}
				>{translate('de', 'admin.previous')}</a
			>{/if}
		{#if data.users.hasNext}<a
				href={`?q=${encodeURIComponent(data.query.q)}&status=${data.query.status}&page=${data.users.page + 1}`}
				>{translate('de', 'admin.next')}</a
			>{/if}
	</nav>
</section>
