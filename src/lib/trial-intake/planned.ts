import type {
	AttentionReason,
	Lesson,
	RebindComparison,
	RebindDifference,
	RebindKind,
} from './contracts';
import { lessonAgeRange, type AgeRange } from './age';

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

/** What a rebind compares: the course entity with the subject as the schedule spells it. */
export interface CourseFacts {
	subject: string;
	weekday: number;
	start: string;
	end: string;
	teacher: string;
	building: string;
	age: AgeRange | null;
}
export function lessonFacts(lesson: CourseLesson): CourseFacts {
	return { ...lesson, age: lessonAgeRange(lesson) };
}
/** The age range stored in a course key; the key is what the queue belongs to. */
export function keyAge(key: string): AgeRange | null {
	const age = (JSON.parse(key) as unknown[])[6] as [number, number | null] | null;
	return age ? { min: age[0], ...(age[1] === null ? {} : { max: age[1] }) } : null;
}
// A school class as a whole name: grade 1-12, letter A-E with an optional digit, or "Kl":
// "1 E", "1A", "4D1", "1Kl". It names a group, not a discipline (OQ-051).
const CLASS_NAME = /^(?:1[0-2]|[1-9]) ?(?:[a-e]\d?|kl)$/u;
export function isClassName(subject: string): boolean {
	return CLASS_NAME.test(plannedText(subject));
}
/** The subject without case, digits and spaces: "Russisch", "russisch" and "Russisch1" are one. */
export function subjectBase(subject: string): string {
	return subject
		.normalize('NFC')
		.toLocaleLowerCase('de-DE')
		.replace(/[\d\s]+/gu, '');
}
const sameAge = (a: AgeRange | null, b: AgeRange | null) => a?.min === b?.min && a?.max === b?.max;
const STRICTNESS: RebindKind[] = ['plain', 'notify', 'price'];
/**
 * WL-15: may the queue of course `from` move to the card `to`, and what follows. Another subject is
 * refused; two class names are compared by their age only; a class against a subject cannot be
 * checked and needs a call. A duration change needs new sums (`price`); weekday, start, teacher and
 * age need a call (`notify`) at any size of the change; a building is shown but changes nothing.
 */
export function compareCourses(from: CourseFacts, to: CourseFacts): RebindComparison {
	const differences: RebindDifference[] = [];
	const reasons: AttentionReason[] = [];
	let kind: RebindKind = 'plain';
	const raise = (level: RebindKind) => {
		if (STRICTNESS.indexOf(level) > STRICTNESS.indexOf(kind)) kind = level;
	};
	const notify = (reason: AttentionReason) => {
		reasons.push(reason);
		raise('notify');
	};
	let allowed = true;
	const classes = [isClassName(from.subject), isClassName(to.subject)];
	if (plannedText(from.subject) !== plannedText(to.subject)) {
		differences.push({ field: 'subject', from: from.subject, to: to.subject });
		if (classes[0] !== classes[1]) notify({ code: 'subject_check' });
		else if (!classes[0]) {
			const base = subjectBase(from.subject);
			allowed = base !== '' && base === subjectBase(to.subject);
		}
	} else if (!classes[0] && !subjectBase(from.subject)) allowed = false;
	if (from.weekday !== to.weekday) {
		differences.push({ field: 'weekday', from: from.weekday, to: to.weekday });
		notify({ code: 'weekday' });
	}
	if (from.start !== to.start) {
		differences.push({ field: 'start', from: from.start, to: to.start });
		notify({ code: 'time', from: from.start, to: to.start });
	}
	const minutes = [lessonMinutes(from), lessonMinutes(to)];
	if (minutes[0] !== minutes[1]) {
		differences.push({ field: 'minutes', from: minutes[0], to: minutes[1] });
		raise('price');
	}
	if (plannedText(from.teacher) !== plannedText(to.teacher)) {
		differences.push({ field: 'teacher', from: from.teacher, to: to.teacher });
		notify({ code: 'teacher' });
	}
	if (plannedText(from.building) !== plannedText(to.building))
		differences.push({ field: 'building', from: from.building, to: to.building });
	if (!sameAge(from.age, to.age)) {
		differences.push({ field: 'age', from: from.age, to: to.age });
		notify({ code: 'age' });
	}
	return { allowed, kind, differences, reasons };
}
/** Both cards as the schedule has them; the unit tests of WL-15 use this form. */
export function compareLessons(from: CourseLesson, to: CourseLesson): RebindComparison {
	return compareCourses(lessonFacts(from), lessonFacts(to));
}
/** Orange reasons of two rebinds without repeats, in the order they arose. */
export function mergeReasons(
	...lists: (readonly AttentionReason[] | null | undefined)[]
): AttentionReason[] {
	const seen = new Set<string>();
	return lists
		.flatMap((list) => list ?? [])
		.filter((reason) => {
			const id = JSON.stringify(reason);
			return !seen.has(id) && Boolean(seen.add(id));
		});
}
