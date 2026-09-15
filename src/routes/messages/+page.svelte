<script lang="ts">
	import { translateUiFeedback } from '$lib/i18n';
	import { page as portalPage } from '$app/state';
	const uiLocale = $derived(portalPage.data.locale ?? portalPage.error?.locale ?? 'de');
	import '../../app.css';
	import { translate } from '$lib/i18n';
	import { formatTimestamp } from '$lib/i18n/locale';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const categories = ['technical', 'contract', 'payment', 'schedule', 'nachhilfe', 'other'] as const;
	const threadValues = $derived(form && 'threadValues' in form ? form.threadValues : undefined);
	let category = $derived(threadValues?.category ?? data.contractInquiry?.category ?? 'technical');
	let subject = $derived(threadValues?.subject ?? data.contractInquiry?.subject ?? '');
	let message = $derived(threadValues?.message ?? data.contractInquiry?.message ?? '');
</script>

<svelte:head><title>{translate(uiLocale, 'messages.title')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate(uiLocale, 'cabinet.navigationLabel')}>
		<a href="/cabinet">{translate(uiLocale, 'messages.back')}</a>
		<a href="/catalog">{translate(uiLocale, 'trial.backToCatalog')}</a>
	</nav>
	<h1>{translate(uiLocale, 'messages.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{translateUiFeedback(uiLocale, form.message)}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'messages.newThread')}</h2>
		<form class="admin-action-form thread-form" method="POST" action="?/create" aria-describedby={category === 'contract' ? 'contract-inquiry-notice' : undefined}>
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={threadValues?.idempotencyKey ?? data.threadKey} />
			<label>{translate(uiLocale, 'messages.category')}
				<select name="category" bind:value={category} required>
					{#each categories as option}
						<option value={option}>{translate(uiLocale, `messages.category.${option}` as 'messages.category.other')}</option>
					{/each}
				</select>
			</label>
			{#if category === 'contract'}
				<div id="contract-inquiry-notice" class="notice-card">
					<p>{translate(uiLocale, 'catalog.contract.notice')}</p>
					<p>{translate(uiLocale, 'catalog.contract.editNotice')}</p>
				</div>
			{/if}
			<label>{translate(uiLocale, 'messages.subject')}
				<input name="subject" type="text" bind:value={subject} required maxlength="160" />
			</label>
			<label>{translate(uiLocale, 'messages.message')}
				<textarea name="message" bind:value={message} required maxlength="4000"></textarea>
			</label>
			<button type="submit">{translate(uiLocale, 'messages.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'absence.title')}</h2>
		<p>{translate(uiLocale, 'absence.businessHours')}</p>
		<form class="admin-action-form" method="POST" action="?/absence">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.absenceKey} />
			<label>{translate(uiLocale, 'absence.enrollment')}
				<select name="enrollmentId" required>
					<option value="">{translate(uiLocale, 'absence.chooseEnrollment')}</option>
					{#each data.absenceEnrollments as option}
						<option value={option.enrollmentId}>{option.childName} · {option.courseName}</option>
					{/each}
				</select>
			</label>
			<label>{translate(uiLocale, 'absence.date')}<input type="date" name="absenceDate" required /></label>
			<label>{translate(uiLocale, 'absence.reason')}<input name="reason" required maxlength="500" /></label>
			<label>{translate(uiLocale, 'absence.message')}<textarea name="message" maxlength="3000"></textarea></label>
			<button type="submit">{translate(uiLocale, 'absence.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate(uiLocale, 'messages.list')}</h2>
		{#if data.threads.length === 0}<p>{translate(uiLocale, 'cabinet.messages.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.threads as thread}
				<article class="activity-item">
					<p class="item-kicker">{translate(uiLocale, `messages.category.${thread.category}` as 'messages.category.other')} · {translate(uiLocale, `messages.status.${thread.status}` as 'messages.status.open')}</p>
					<h3>{thread.subject}</h3>
					<p>{formatTimestamp(uiLocale, thread.updatedAt)} · {thread.messageCount}</p>
					<a href={`/messages/${thread.publicReference}`}>{translate(uiLocale, 'messages.open')}</a>
				</article>
			{/each}
		</div>
	</section>
</main>

<style>
	.thread-form { max-width: 52rem; }
	.thread-form label { display: grid; gap: .35rem; }
	.thread-form input[type="text"] { max-width: 36rem; }
	.thread-form select { max-width: 24rem; }
	.thread-form textarea { min-height: 15rem; width: 100%; }
	.thread-form button { justify-self: start; }
</style>
