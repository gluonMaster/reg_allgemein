<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<section class="admin-section">
	<a href="/admin/legacy">← {translate('de', 'admin.legacy.title')}</a>
	<h2>{data.family.display_family_id}</h2>
	<p class="sensitive-notice">{translate('de', 'admin.legacy.detailNotice')}</p>
	<dl class="admin-detail-grid">
		<div>
			<dt>{translate('de', 'admin.parentName')}</dt>
			<dd>{data.family.parent_name_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.address')}</dt>
			<dd>{data.family.address_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.phone')}</dt>
			<dd>{data.family.phone_raw ?? data.family.mobile_raw ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.ownership')}</dt>
			<dd>
				{translateAdminCode('de', data.family.claimed_by_user_id ? 'owned' : 'unowned')}
			</dd>
		</div>
	</dl>
	<h3>{translate('de', 'admin.emails')}</h3>
	<ul>
		{#each data.family.emails as email}<li>{email.email_raw}</li>{/each}
	</ul>
	<h3>{translate('de', 'admin.children')}</h3>
	<ul>
		{#each data.family.children as child}<li>
				{child.full_name} · {child.birth_date} · {translateAdminCode(
					'de',
					child.owner_user_id ? 'owned' : 'unowned'
				)}
			</li>{/each}
	</ul>
	<h3>{translate('de', 'admin.activities')}</h3>
	<ul>
		{#each data.family.activities as activity}<li>
				{activity.group_name_raw} · {activity.lesson_kind ??
					translateAdminCode('de', 'needs_review')}{activity.needs_admin_review
					? ` · ${translateAdminCode('de', 'needs_review')}`
					: ''}
			</li>{/each}
	</ul>
</section>
