<script lang="ts">
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import { translate, translateAdminCode } from '$lib/i18n';
	import { formatCalendarDate } from '$lib/i18n/locale';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const euro = $derived(
		new Intl.NumberFormat(uiLocale === 'ru' ? 'ru-RU' : 'de-DE', {
			style: 'currency',
			currency: 'EUR',
		})
	);
	const money = (cents: number | null) => (cents === null ? '—' : euro.format(cents / 100));
</script>

<section class="admin-section">
	<h2>{translate(uiLocale, 'admin.pricing.title')}</h2>
	<p>{translate(uiLocale, 'admin.pricing.readOnlyNotice')}</p>
	<div class="admin-metrics">
		<div class="metric-card">
			<strong>{data.pricing.diagnosticCounts.profiles_needing_review}</strong><span
				>{translate(uiLocale, 'admin.pricing.profileReviews')}</span
			>
		</div>
		<div class="metric-card">
			<strong>{data.pricing.diagnosticCounts.estimates_needing_confirmation}</strong><span
				>{translate(uiLocale, 'admin.pricing.fallbackReviews')}</span
			>
		</div>
	</div>
	<h3>{translate(uiLocale, 'admin.pricing.versions')}</h3>
	{#if data.pricing.versions.length === 0}<p class="admin-empty">
			{translate(uiLocale, 'admin.pricing.emptyVersions')}
		</p>{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users must be able to scroll the table region.) -->
		<div
			class="admin-table-wrap"
			tabindex="0"
			role="region"
			aria-label={translate(uiLocale, 'admin.pricing.versions')}
		>
			<table>
				<thead
					><tr
						><th>{translate(uiLocale, 'admin.period')}</th><th
							>{translate(uiLocale, 'admin.pricing.version')}</th
						><th>{translate(uiLocale, 'admin.date')}</th><th
							>{translate(uiLocale, 'admin.pricing.rules')}</th
						><th>{translate(uiLocale, 'admin.status')}</th></tr
					></thead
				>
				<tbody
					>{#each data.pricing.versions as version}<tr
							><td>{version.academic_period}</td><td>{version.label}</td><td
								>{formatCalendarDate(uiLocale, version.valid_from)}</td
							><td>{version.rule_count}</td><td
								>{translateAdminCode(
									uiLocale,
									version.is_active ? 'active' : 'inactive'
								)}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	{/if}
	<h3>{translate(uiLocale, 'admin.pricing.rules')}</h3>
	<p>{translate(uiLocale, 'admin.pricing.sourceExplanation')}</p>
	{#if data.pricing.rules.length === 0}<p class="admin-empty">
			{translate(uiLocale, 'admin.pricing.emptyRules')}
		</p>{:else}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users must be able to scroll the table region.) -->
		<div
			class="admin-table-wrap"
			tabindex="0"
			role="region"
			aria-label={translate(uiLocale, 'admin.pricing.rules')}
		>
			<table>
				<thead
					><tr
						><th>{translate(uiLocale, 'admin.pricing.key')}</th><th
							>{translate(uiLocale, 'admin.pricing.childrenCount')}</th
						><th>{translate(uiLocale, 'admin.pricing.duration')}</th><th
							>{translate(uiLocale, 'admin.pricing.yearlyRate')}</th
						><th>{translate(uiLocale, 'admin.pricing.monthlyRate')}</th><th
							>{translate(uiLocale, 'admin.status')}</th
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
									? translateAdminCode(uiLocale, 'valid')
									: translateAdminCode(
											uiLocale,
											rule.validation_code ?? 'invalid'
										)}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>
	{/if}
</section>
