<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t, dayLabel, formatDate, formatTimestamp, errorKey, type TextKey } from '../i18n';
	import { itemLesson, type AdminListData, type EmailJob } from '../contracts';
	import { requestJson } from '../client';
	import LessonCard from './LessonCard.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { translateAdminCode } from '$lib/i18n';
	import '../intake.css';
	let {
		data,
	}: { data: { intakeList: AdminListData; emailQueue: EmailJob[]; csrfToken: string } } =
		$props();
	const locale = $derived(page.data.locale ?? 'de');
	const list = $derived(data.intakeList);
	const query = $derived(list.query);
	let busy = $state(false),
		feedback = $state<TextKey | null>(null);
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	function pageLink(number: number) {
		const q = new URLSearchParams(page.url.search);
		q.set('page', String(number));
		return `/admin/trial-intake?${q}`;
	}
	async function retryEmail(id: string) {
		busy = true;
		feedback = null;
		try {
			await requestJson('/admin/trial-intake/email', { id, _csrf: data.csrfToken });
			await invalidateAll();
			feedback =
				data.emailQueue.find((job) => job.id === id)?.status === 'dead'
					? 'emailExpired'
					: 'emailQueued';
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t(locale, 'adminTitle')} · {ORGANIZATION_NAME}</title></svelte:head>
<section class="intake">
	<h2>{t(locale, 'adminTitle')}</h2>
	<p>{t(locale, 'adminIntro')}</p>
	<form method="GET" action="/admin/trial-intake" class="card">
		<details open>
			<summary>{t(locale, 'filters')}</summary>
			<div class="filters">
				<label
					>{t(locale, 'subject')}<input
						name="subject"
						value={query.subject}
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'teacher')}<input
						name="teacher"
						value={query.teacher}
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'day')}<select
						name="weekday"
						aria-label={t(locale, 'day')}
						value={query.weekday}
						><option value={0}>{t(locale, 'all')}</option
						>{#each [1, 2, 3, 4, 5, 6, 7] as day}<option value={day}
								>{dayLabel(day, locale)}</option
							>{/each}</select
					></label
				>
				<label
					>{t(locale, 'building')}<select
						name="building"
						aria-label={t(locale, 'building')}
						value={query.building}
						><option value="">{t(locale, 'all')}</option><option value="Kolibri"
							>Kolibri</option
						><option value="Villa">Villa</option></select
					></label
				>
				<label
					>{t(locale, 'parentSurname')}<input
						name="parentLastName"
						value={query.parentLastName}
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'childSurname')}<input
						name="childLastName"
						value={query.childLastName}
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'status')}<select
						name="status"
						aria-label={t(locale, 'status')}
						value={query.status}
						>{#each ['verified', 'processed', 'all'] as status}<option value={status}
								>{t(locale, status as TextKey)}</option
							>{/each}</select
					></label
				>
				<label
					>{t(locale, 'sort')}<select
						name="sort"
						aria-label={t(locale, 'sort')}
						value={query.sort}
						>{#each ['received', 'subject', 'teacher', 'day', 'parent', 'child'] as sort}<option
								value={sort}>{t(locale, sort as TextKey)}</option
							>{/each}</select
					></label
				>
				<label
					>{t(locale, 'direction')}<select
						name="direction"
						aria-label={t(locale, 'direction')}
						value={query.direction}
						><option value="desc">{t(locale, 'desc')}</option><option value="asc"
							>{t(locale, 'asc')}</option
						></select
					></label
				>
			</div>
			<div class="actions">
				<button class="primary" type="submit">{t(locale, 'apply')}</button><a
					href="/admin/trial-intake">{t(locale, 'reset')}</a
				>
			</div>
		</details>
	</form>
	<p role="status">{t(locale, 'total')}: {list.total}</p>
	{#each list.rows as row (row.id)}
		<article class="card">
			<span class="badge">{t(locale, row.state)}</span>
			<p class="muted">
				{t(locale, 'request')}
				{row.request_id.slice(0, 8)} · {formatTimestamp(row.verified_at, locale)}
			</p>
			<LessonCard lesson={itemLesson(row)} {locale} />
			<p><strong>{t(locale, 'date')}: {formatDate(row.desired_date, locale)}</strong></p>
			<p>{t(locale, 'parent')}: {row.parent_first_name} {row.parent_last_name}</p>
			<ul>
				{#each row.children as child}<li>
						{child.firstName}
						{child.lastName} · {formatDate(child.birthDate, locale)}
					</li>{/each}
			</ul>
			<a class="button" href={`/admin/trial-intake/${row.request_id}`}
				>{t(locale, 'details')}</a
			>
		</article>
	{:else}<p class="card">{t(locale, 'empty')}</p>{/each}
	<nav class="pagination" aria-label={t(locale, 'page')}>
		{#if query.page > 1}<a class="button" href={pageLink(query.page - 1)}
				>{t(locale, 'previous')}</a
			>{/if}
		<span>{t(locale, 'page')} {query.page} / {Math.max(1, Math.ceil(list.total / 50))}</span>
		{#if query.page * 50 < list.total}<a class="button" href={pageLink(query.page + 1)}
				>{t(locale, 'next')}</a
			>{/if}
	</nav>
	<details
		class="card"
		open={Boolean(feedback) || data.emailQueue.some((job) => job.status === 'dead')}
	>
		<summary
			>{t(locale, 'emailQueue')} ({data.emailQueue.length}{data.emailQueue.length === 50
				? '+'
				: ''})</summary
		>
		<p>{t(locale, 'emailQueueHint')}</p>
		{#if feedback}<p role="status">{t(locale, feedback)}</p>{/if}
		{#each data.emailQueue as job (job.id)}<div class="result">
				<p>
					<code>{job.id}</code> · {translateAdminCode(locale, job.status)} · {job.attempts}/{job.max_attempts}
				</p>
				{#if job.last_error_code}<p>{job.last_error_code}</p>{/if}
				{#if job.status === 'dead'}<button
						type="button"
						disabled={busy || !enhanced}
						onclick={() => retryEmail(job.id)}>{t(locale, 'emailRetry')}</button
					>{/if}
			</div>{/each}
	</details>
</section>
