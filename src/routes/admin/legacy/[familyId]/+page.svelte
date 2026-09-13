<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<a href="/admin/legacy">← {translate(uiLocale, 'admin.legacy.title')}</a>
	<h2>{data.family.display_family_id}</h2>
	<p class="sensitive-notice">{translate(uiLocale, 'admin.legacy.detailNotice')}</p>
	<dl class="admin-detail-grid">
		<div>
			<dt>{translate(uiLocale, 'admin.parentName')}</dt>
			<dd>{data.family.parent_name_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.address')}</dt>
			<dd>{data.family.address_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.phone')}</dt>
			<dd>{data.family.phone_raw ?? data.family.mobile_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate(uiLocale, 'admin.ownership')}</dt>
			<dd>
				{translateAdminCode(uiLocale, data.family.claimed_by_user_id ? 'owned' : 'unowned')}
			</dd>
		</div>
	</dl>
	<h3>{translate(uiLocale, 'admin.emails')}</h3>
	<ul>
		{#each data.family.emails as email}<li>{email.email_raw}</li>{/each}
	</ul>
	<h3>{translate(uiLocale, 'admin.children')}</h3>
	<ul>
		{#each data.family.children as child}<li>
				{child.full_name} · {child.birth_date} · {translateAdminCode(uiLocale,
					child.owner_user_id ? 'owned' : 'unowned'
				)}
			</li>{/each}
	</ul>
	<h3>{translate(uiLocale, 'admin.activities')}</h3>
	<ul>
		{#each data.family.activities as activity}<li>
				{activity.group_name_raw} · {activity.lesson_kind ??
					translateAdminCode(uiLocale, 'needs_review')}{activity.needs_admin_review
					? ` · ${translateAdminCode(uiLocale, 'needs_review')}`
					: ''}
			</li>{/each}
	</ul>
</section>
