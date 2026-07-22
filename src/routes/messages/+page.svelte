<script lang="ts">
	import '../../app.css';
	import { translate } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const categories = ['technical', 'contract', 'payment', 'schedule', 'nachhilfe', 'other'] as const;
</script>

<svelte:head><title>{translate('de', 'messages.title')}</title></svelte:head>

<main class="cabinet-shell">
	<nav class="cabinet-nav" aria-label={translate('de', 'cabinet.navigationLabel')}>
		<a href="/cabinet">{translate('de', 'messages.back')}</a>
	</nav>
	<h1>{translate('de', 'messages.title')}</h1>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<section class="cabinet-card">
		<h2>{translate('de', 'messages.newThread')}</h2>
		<form class="admin-action-form" method="POST" action="?/create">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.threadKey} />
			<label>{translate('de', 'messages.category')}
				<select name="category" required>
					{#each categories as category}
						<option value={category}>{translate('de', `messages.category.${category}` as 'messages.category.other')}</option>
					{/each}
				</select>
			</label>
			<label>{translate('de', 'messages.subject')}
				<input name="subject" required maxlength="160" />
			</label>
			<label>{translate('de', 'messages.message')}
				<textarea name="message" required maxlength="4000"></textarea>
			</label>
			<button type="submit">{translate('de', 'messages.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate('de', 'absence.title')}</h2>
		<p>{translate('de', 'absence.businessHours')}</p>
		<form class="admin-action-form" method="POST" action="?/absence">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="idempotencyKey" value={data.absenceKey} />
			<label>{translate('de', 'absence.enrollment')}
				<select name="enrollmentId" required>
					<option value="">{translate('de', 'absence.chooseEnrollment')}</option>
					{#each data.absenceEnrollments as option}
						<option value={option.enrollmentId}>{option.childName} · {option.courseName}</option>
					{/each}
				</select>
			</label>
			<label>{translate('de', 'absence.date')}<input type="date" name="absenceDate" required /></label>
			<label>{translate('de', 'absence.reason')}<input name="reason" required maxlength="500" /></label>
			<label>{translate('de', 'absence.message')}<textarea name="message" maxlength="3000"></textarea></label>
			<button type="submit">{translate('de', 'absence.submit')}</button>
		</form>
	</section>

	<section class="cabinet-card">
		<h2>{translate('de', 'messages.list')}</h2>
		{#if data.threads.length === 0}<p>{translate('de', 'cabinet.messages.empty')}</p>{/if}
		<div class="activity-list">
			{#each data.threads as thread}
				<article class="activity-item">
					<p class="item-kicker">{translate('de', `messages.category.${thread.category}` as 'messages.category.other')} · {translate('de', `messages.status.${thread.status}` as 'messages.status.open')}</p>
					<h3>{thread.subject}</h3>
					<p>{thread.updatedAt} · {thread.messageCount}</p>
					<a href={`/messages/${thread.publicReference}`}>{translate('de', 'messages.open')}</a>
				</article>
			{/each}
		</div>
	</section>
</main>

