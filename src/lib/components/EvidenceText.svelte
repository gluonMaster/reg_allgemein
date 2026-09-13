<script lang="ts">
	import { page } from '$app/state';
	import { formatMessage, type MessageKey } from '$lib/i18n';
	let {
		messageKey,
		original,
		parameters = {},
	}: {
		messageKey: MessageKey;
		original?: string;
		parameters?: Readonly<Record<string, string | number>>;
	} = $props();
	const locale = $derived(page.data.locale ?? page.error?.locale ?? 'de');
</script>

<span lang="de">{original ?? formatMessage('de', messageKey, parameters)}</span>
{#if locale === 'ru'}
	<span class="evidence-translation" lang="ru">{formatMessage('ru', messageKey, parameters)}</span>
{/if}

<style>
	.evidence-translation {
		display: block;
		margin-top: 0.4rem;
	}
</style>
