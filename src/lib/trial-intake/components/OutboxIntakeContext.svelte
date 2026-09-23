<script lang="ts">
	import { formatBerlinTime } from '$lib/i18n/locale';
	import { t, type Locale } from '../i18n';
	import type { IntakeOutboxContext } from '../contracts';
	let {
		context,
		requestId,
		locale,
	}: { context: IntakeOutboxContext; requestId: string; locale: Locale } = $props();
</script>

{#if context.deleted}
	<p>{t(locale, 'request')}: {t(locale, 'outboxDeleted')}</p>
{:else}
	<p>
		{t(locale, 'request')}: <strong>{context.parentLastName}</strong> · {context.subjects.join(
			', '
		)} · {t(locale, 'outboxReceived')}
		{formatBerlinTime(locale, context.receivedAt)}
	</p>
	<p><a href={`/admin/trial-intake/${requestId}`}>{t(locale, 'outboxOpen')}</a></p>
{/if}
