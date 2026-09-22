<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t, dayLabel, errorKey, type TextKey } from '../i18n';
	import { closedKey } from '../closed';
	import type { AdminGroupsData, Lesson } from '../contracts';
	import { requestJson } from '../client';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import '../intake.css';
	let { data }: { data: AdminGroupsData & { csrfToken: string } } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	const closedKeys = $derived(new Set(data.closed.map((row) => row.match_key)));
	const subjects = $derived(
		[...new Set(data.lessons.map((lesson) => lesson.subject))]
			.sort((a, b) => a.localeCompare(b, 'de'))
			.map((subject) => ({
				subject,
				lessons: data.lessons
					.filter((lesson) => lesson.subject === subject)
					.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)),
			}))
	);
	// A record whose lesson left the schedule stays visible so an admin can clear it.
	const stale = $derived(
		data.closed.filter(
			(row) => !data.lessons.some((lesson) => closedKey(lesson) === row.match_key)
		)
	);
	const matches = (lesson: Lesson) =>
		data.lessons.filter((other) => closedKey(other) === closedKey(lesson)).length;
	let busy = $state(false),
		feedback = $state<TextKey | null>(null),
		enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	async function send(body: Record<string, unknown>) {
		busy = true;
		feedback = null;
		try {
			await requestJson('/admin/trial-intake/groups', { ...body, _csrf: data.csrfToken });
			await invalidateAll();
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t(locale, 'adminGroups')} · {ORGANIZATION_NAME}</title></svelte:head>
<section class="intake">
	<h2>{t(locale, 'adminGroups')}</h2>
	<p>{t(locale, 'adminGroupsIntro')}</p>
	{#if feedback}<p class="error" role="alert">{t(locale, feedback)}</p>{/if}
	{#if data.catalogError}<p class="card" role="status">
			{t(locale, 'adminGroupsCatalogError')}
		</p>{/if}
	{#each subjects as group (group.subject)}
		<details
			class="card"
			open={group.lessons.some((lesson) => closedKeys.has(closedKey(lesson)))}
		>
			<summary>{group.subject}</summary>
			{#each group.lessons as lesson (lesson.id)}
				<div class="result">
					<p>
						<strong>{lesson.group}</strong> · {dayLabel(lesson.weekday, locale)} · {lesson.start}–{lesson.end}
					</p>
					<p class="muted">{lesson.teacher} · {lesson.building} · {lesson.room}</p>
					{#if matches(lesson) > 1}
						<p class="muted">{t(locale, 'adminGroupsMatches')}: {matches(lesson)}</p>
					{/if}
					<label class="check"
						><input
							type="checkbox"
							checked={closedKeys.has(closedKey(lesson))}
							disabled={busy || !enhanced}
							onchange={(event) =>
								send({
									lessonId: lesson.id,
									closed: event.currentTarget.checked,
								})}
						/>{t(locale, 'adminGroupsClosed')}</label
					>
				</div>
			{/each}
		</details>
	{/each}
	{#if stale.length}
		<div class="card">
			<p>{t(locale, 'adminGroupsStale')}</p>
			{#each stale as row (row.match_key)}
				<div class="result">
					<p>
						<strong>{row.group_name}</strong> · {row.subject} · {dayLabel(
							row.weekday,
							locale
						)}
					</p>
					<button
						type="button"
						disabled={busy || !enhanced}
						onclick={() => send({ matchKey: row.match_key, closed: false })}
						>{t(locale, 'adminGroupsRemove')}</button
					>
				</div>
			{/each}
		</div>
	{/if}
</section>
