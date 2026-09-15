<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { translate } from '$lib/i18n';
	const locale = $derived(page.error?.locale ?? page.data.locale ?? 'de');
	let pending = $state(false);
	let failed = $state(false);
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	async function changeLanguage(event: SubmitEvent) {
		event.preventDefault();
		if (pending || !(event.currentTarget instanceof HTMLFormElement)) return;
		const form = new FormData(event.currentTarget, event.submitter);
		pending = true;
		failed = false;
		try {
			const response = await fetch('/language', {
				method: 'POST',
				body: form,
				headers: { accept: 'application/json' },
				referrerPolicy: 'same-origin',
				referrer: `${page.url.origin}/`,
			});
			if (!response.ok) throw new Error('Language preference rejected');
			await invalidateAll();
		} catch {
			failed = true;
		} finally {
			pending = false;
		}
	}
	$effect(() => {
		document.documentElement.lang = locale;
	});
</script>

<nav
	class="language-switcher"
	data-enhanced={enhanced}
	aria-label={translate(locale, 'language.label')}
>
	<form method="POST" action="/language" onsubmit={changeLanguage}>
		<input
			type="hidden"
			name="returnTo"
			value={`${page.url.pathname}${page.url.search}${page.url.hash}`}
		/>
		<button
			type="submit"
			name="locale"
			value="de"
			lang="de"
			aria-pressed={locale === 'de'}
			disabled={pending}>Deutsch</button
		>
		<button
			type="submit"
			name="locale"
			value="ru"
			lang="ru"
			aria-pressed={locale === 'ru'}
			disabled={pending}>Русский</button
		>
	</form>
	{#if failed}<p role="alert">{translate(locale, 'language.failed')}</p>{/if}
</nav>

<style>
	.language-switcher {
		min-width: 0;
	}
	form {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button {
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		border: 1px solid #cbd5e1;
		border-radius: 0.5rem;
		background: #fff;
		color: #334155;
		font: inherit;
		cursor: pointer;
	}
	button[aria-pressed='true'] {
		background: #176b54;
		color: #fff;
		border-color: #176b54;
	}
	button:focus-visible {
		outline: 3px solid #2563eb;
		outline-offset: 3px;
	}
</style>
