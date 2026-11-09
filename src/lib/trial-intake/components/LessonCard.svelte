<script lang="ts">
	import type { Lesson } from '../contracts';
	import { ageByArrangement, lessonAgeRange } from '../age';
	import { isPlannedLesson, lessonMinutes } from '../planned';
	import { ageRangeLabel, dayLabel, fill, t, type Locale } from '../i18n';
	// `duration`: the waitlist card states the length in minutes (WL-04).
	let {
		lesson,
		locale,
		duration = false,
	}: { lesson: Omit<Lesson, 'id'>; locale: Locale; duration?: boolean } = $props();
	const ages = $derived(lessonAgeRange(lesson));
</script>

<div class="intake-lesson">
	<!-- The planned placeholder and its editor suffix are not a group name (WL-01). -->
	<strong>{lesson.subject}</strong><span
		>{isPlannedLesson(lesson) ? t(locale, 'plannedLabel') : lesson.group}</span
	>
	<p>
		{dayLabel(lesson.weekday, locale)} · {lesson.start}–{lesson.end}{duration
			? ` (${fill(t(locale, 'minutes'), { n: lessonMinutes(lesson) })})`
			: ''}
	</p>
	{#if ages}<p>{t(locale, 'age')}: {ageRangeLabel(ages, locale)}</p>
	{:else if ageByArrangement(lesson)}<p>
			{t(locale, 'age')}: {t(locale, 'ageByArrangement')}
		</p>{/if}
	<p>{lesson.teacher}</p>
	<p>{lesson.building} · {t(locale, 'room')} {lesson.room}</p>
</div>
