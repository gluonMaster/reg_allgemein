<script lang="ts">
	import type { Lesson } from '../contracts';
	import { ageByArrangement, lessonAgeRange } from '../age';
	import { isPlannedLesson } from '../planned';
	import { ageRangeLabel, dayLabel, t, type Locale } from '../i18n';
	let { lesson, locale }: { lesson: Omit<Lesson, 'id'>; locale: Locale } = $props();
	const ages = $derived(lessonAgeRange(lesson));
</script>

<div class="intake-lesson">
	<!-- The planned placeholder and its editor suffix are not a group name (WL-01). -->
	<strong>{lesson.subject}</strong><span
		>{isPlannedLesson(lesson) ? t(locale, 'plannedLabel') : lesson.group}</span
	>
	<p>{dayLabel(lesson.weekday, locale)} · {lesson.start}–{lesson.end}</p>
	{#if ages}<p>{t(locale, 'age')}: {ageRangeLabel(ages, locale)}</p>
	{:else if ageByArrangement(lesson)}<p>
			{t(locale, 'age')}: {t(locale, 'ageByArrangement')}
		</p>{/if}
	<p>{lesson.teacher}</p>
	<p>{lesson.building} · {t(locale, 'room')} {lesson.room}</p>
</div>
