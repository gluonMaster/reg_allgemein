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
	const course = $derived(portalPage.url.searchParams.get('course'));
	// Locale invalidation may refresh defaults, but must not replace the user's edits.
	let edits = $state<{
		course: string | null;
		category?: string;
		subject?: string;
		message?: string;
	}>();
	const currentEdits = $derived(edits?.course === course ? edits : undefined);
	const category = $derived(currentEdits?.category ?? threadValues?.category ?? data.contractInquiry?.category ?? 'technical');
	const subject = $derived(currentEdits?.subject ?? threadValues?.subject ?? data.contractInquiry?.subject ?? '');
	const message = $derived(currentEdits?.message ?? threadValues?.message ?? data.contractInquiry?.message ?? '');
	function edit(field: 'category' | 'subject' | 'message', value: string) {
		edits = { ...currentEdits, course, [field]: value };
	}
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
				<select name="category" value={category} onchange={(event) => edit('category', event.currentTarget.value)} required>
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
				<input name="subject" type="text" value={subject} oninput={(event) => edit('subject', event.currentTarget.value)} required maxlength="160" />
			</label>
			<label>{translate(uiLocale, 'messages.message')}
				<textarea name="message" value={message} oninput={(event) => edit('message', event.currentTarget.value)} required maxlength="4000"></textarea>
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
