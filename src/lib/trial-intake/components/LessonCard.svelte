<script lang="ts">
	import type { Lesson } from '../contracts';
	import { dayLabel, t, type Locale } from '../i18n';
	let { lesson, locale }: { lesson: Omit<Lesson, 'id'>; locale: Locale } = $props();
</script>

<div class="intake-lesson">
	<strong>{lesson.subject}</strong><span>{lesson.group}</span>
	<p>{dayLabel(lesson.weekday, locale)} · {lesson.start}–{lesson.end}</p>
	<p>{lesson.teacher}</p>
	<p>{lesson.building} · {t(locale, 'room')} {lesson.room}</p>
</div>
