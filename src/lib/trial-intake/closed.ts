import type { Lesson } from './contracts';

/**
 * Subject + group + weekday, without the time: lesson times change often and a closure must
 * survive that, as well as a new room, teacher or building. Group alone is not enough — the
 * same label covers different lessons (`1B` is both Russisch and Kunst).
 */
export function closedKey(lesson: Pick<Lesson, 'subject' | 'group' | 'weekday'>): string {
	const text = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('de-DE');
	return JSON.stringify([text(lesson.subject), text(lesson.group), lesson.weekday]);
}
