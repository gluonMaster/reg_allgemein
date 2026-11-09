import type { Lesson } from './contracts';

/** Completed years, both bounds inclusive; without `max` there is no upper limit. */
export interface AgeRange {
	min: number;
	max?: number;
}
/** How a child fits a group on the lesson date (owner decision 2026-10-20). */
export type AgeFit = 'ok' | 'young' | 'old';

const RANGE = /(?<!\d)(\d{1,2})-(\d{1,2})J/u; // "3-4JC", "Tanz Do 10-11J"
const FROM = /\bab\s?(\d{1,2})\s?J/iu; // "Tanz Mi ab 7J"
const SINGLE = /(?<![\d-])(\d{1,2})J(?![a-z])/u; // "4J Log": four-year-olds
// Grade 1-12 and letter A-E as in the schedule exporter ("3A", "Kunst Sa 1C+1D", "4D1"), or "1Kl".
const CLASS = /(?<![0-9A-Za-z])(1[0-2]|[1-9])(?:[A-E]|Kl)(?![A-Za-z])/gu;
// A planned class can stand in the subject field, spelled with a space: "2 E" (OQ-051).
const SUBJECT_CLASS = /(?<![0-9A-Za-z])(1[0-2]|[1-9]) ?(?:[A-E]|Kl)(?![A-Za-z])/gu;
/** Owner's ages for subjects whose group names carry none (2026-10-20). */
const SUBJECT_AGES: Record<string, AgeRange> = {
	schach: { min: 5 },
	'soroban-abacus': { min: 6, max: 9 },
	baby: { min: 1, max: 3 },
	english: { min: 6 },
	orchester: { min: 6 },
	gitarre: { min: 10 },
	'1 e': { min: 5, max: 6 }, // a first grade still "in Planung"
};
/** Until the schedule names their age; a renamed group falls back to the rules above. */
const GROUP_AGES: Record<string, AgeRange> = {
	'kunst mi': { min: 10 },
	'kunst sa': { min: 8 },
};
const key = (text: string) => text.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de-DE');

function namedRange(group: string, classes = CLASS): AgeRange | null {
	let match = RANGE.exec(group);
	if (match) return { min: Number(match[1]), max: Number(match[2]) };
	if ((match = FROM.exec(group))) return { min: Number(match[1]) };
	if ((match = SINGLE.exec(group))) return { min: Number(match[1]), max: Number(match[1]) };
	const grades = [...group.matchAll(classes)].map((m) => Number(m[1]));
	if (grades.length) return { min: Math.min(...grades) + 4, max: Math.max(...grades) + 5 };
	return null;
}
/** Only where nothing else applies: "English1" as English, then the subject's own name. */
function subjectRange(subject: string): AgeRange | null {
	return (
		SUBJECT_AGES[key(subject.replace(/\d/gu, ''))] ??
		namedRange(subject.normalize('NFC'), SUBJECT_CLASS)
	);
}
/**
 * The schedule shows "ab NJ" for grade N (N + 4). A class group admits ages N + 4 to N + 5;
 * joint classes span from the lowest to the highest grade. What the name states wins; an owner
 * rule only adds a missing upper bound ("Mathe ab 6J" of Soroban 6-9 stays 6-9).
 */
export function lessonAgeRange(lesson: Pick<Lesson, 'subject' | 'group'>): AgeRange | null {
	const named = namedRange(lesson.group.normalize('NFC'));
	const owner = GROUP_AGES[key(lesson.group)] ?? SUBJECT_AGES[key(lesson.subject)] ?? null;
	if (!named) return owner ?? subjectRange(lesson.subject);
	if (named.max !== undefined || owner?.max === undefined || owner.max < named.min) return named;
	return { min: named.min, max: owner.max };
}
/** Kunst studios take pupils with drawing experience; the bureau agrees the age individually. */
export function ageByArrangement(lesson: Pick<Lesson, 'subject' | 'group'>): boolean {
	return (
		key(lesson.subject) === 'kunst' && /studio/iu.test(lesson.group) && !lessonAgeRange(lesson)
	);
}
export function ageOn(birthDate: string, date: string): number {
	const [by, bm, bd] = birthDate.split('-').map(Number);
	const [y, m, d] = date.split('-').map(Number);
	return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
/** An unknown range or a date not entered yet never blocks. */
export function ageFit(range: AgeRange | null, birthDate: string, date: string): AgeFit {
	if (!range || !birthDate || !date) return 'ok';
	const age = ageOn(birthDate, date);
	if (age < range.min) return 'young';
	return range.max !== undefined && age > range.max ? 'old' : 'ok';
}
