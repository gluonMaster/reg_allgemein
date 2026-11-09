import type { Lesson } from './contracts';
import { lessonAgeRange } from './age';

/** Trim, NFC, collapsed spaces and German lower case: the comparison of WL-01 and WL-15. */
export function plannedText(value: string): string {
	return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');
}
const PLACEHOLDER = 'der kurs befindet sich in der planung';
/**
 * WL-01: the schedule editor marks a course still being planned by this group placeholder. A
 * number after it ("… Planung 1", "…Planung2") only keeps the editor's names unique.
 */
export function isPlannedLesson(lesson: Pick<Lesson, 'group'>): boolean {
	return plannedText(lesson.group).startsWith(PLACEHOLDER);
}
export function lessonMinutes(lesson: Pick<Lesson, 'start' | 'end'>): number {
	const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
	return minutes(lesson.end) - minutes(lesson.start);
}
export type CourseLesson = Pick<
	Lesson,
	'subject' | 'group' | 'weekday' | 'start' | 'end' | 'teacher' | 'building'
>;
/**
 * WL-15 (OQ-051): price, queue and start belong to the course, not to the group name. The key is
 * weekday, subject, start, duration in minutes, teacher, building and age range; the group
 * suffix and the room are left out, so renaming either keeps the queue. The duration sits at
 * index 3: migration 0032 reads it from the key to tell a duration change apart.
 */
export function plannedCourseKey(lesson: CourseLesson): string {
	const age = lessonAgeRange(lesson);
	return JSON.stringify([
		lesson.weekday,
		plannedText(lesson.subject),
		lesson.start,
		lessonMinutes(lesson),
		plannedText(lesson.teacher),
		plannedText(lesson.building),
		age ? [age.min, age.max ?? null] : null,
	]);
}
