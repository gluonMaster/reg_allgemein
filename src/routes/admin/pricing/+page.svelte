<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
	const money = (cents: number | null) => (cents === null ? '—' : euro.format(cents / 100));
</script>

<section class="admin-section">
	<h2>{translate('de', 'admin.pricing.title')}</h2>
	<p>{translate('de', 'admin.pricing.readOnlyNotice')}</p>
	<div class="admin-metrics">
		<div class="metric-card">
			<strong>{data.pricing.diagnosticCounts.profiles_needing_review}</strong><span
				>{translate('de', 'admin.pricing.profileReviews')}</span
			>
		</div>
		<div class="metric-card">
			<strong>{data.pricing.diagnosticCounts.estimates_needing_confirmation}</strong><span
				>{translate('de', 'admin.pricing.fallbackReviews')}</span
			>
		</div>
	</div>
	<h3>{translate('de', 'admin.pricing.versions')}</h3>
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate('de', 'admin.period')}</th><th
						>{translate('de', 'admin.pricing.version')}</th
					><th>{translate('de', 'admin.date')}</th><th
						>{translate('de', 'admin.pricing.rules')}</th
					><th>{translate('de', 'admin.status')}</th></tr
				></thead
			>
			<tbody
				>{#each data.pricing.versions as version}<tr
						><td>{version.academic_period}</td><td>{version.label}</td><td
							>{version.valid_from}</td
						><td>{version.rule_count}</td><td
							>{translateAdminCode(
								'de',
								version.is_active ? 'active' : 'inactive'
							)}</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
	<h3>{translate('de', 'admin.pricing.rules')}</h3>
	<p>{translate('de', 'admin.pricing.sourceExplanation')}</p>
	<div class="admin-table-wrap">
		<table>
			<thead
				><tr
					><th>{translate('de', 'admin.pricing.key')}</th><th
						>{translate('de', 'admin.pricing.childrenCount')}</th
					><th>{translate('de', 'admin.pricing.duration')}</th><th
						>{translate('de', 'admin.pricing.yearlyRate')}</th
					><th>{translate('de', 'admin.pricing.monthlyRate')}</th><th
						>{translate('de', 'admin.status')}</th
					></tr
				></thead
			>
			<tbody
				>{#each data.pricing.rules as rule}<tr
						><td>{rule.key ?? '—'}</td><td>{rule.children_count ?? '—'}</td><td
							>{rule.duration_total_minutes ?? '—'}</td
						><td>{money(rule.yearly_price_cents)}</td><td
							>{money(rule.monthly_price_cents)}</td
						><td
							>{rule.is_valid
								? translateAdminCode('de', 'valid')
								: translateAdminCode('de', rule.validation_code ?? 'invalid')}</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
</section>
