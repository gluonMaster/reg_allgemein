import { describe, expect, it } from 'vitest';
import { closedKey } from '$lib/trial-intake/closed';
import { validateSubmission, IntakeError } from '$lib/trial-intake/server/validation.server';
import { nextLessonDate } from '$lib/trial-intake/dates';
import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import type { Lesson } from '$lib/trial-intake/contracts';

const lessons = fixture.lessons as Lesson[];
const NOW = '2026-09-16T12:00:00.000Z';
const lesson = (over: Partial<Lesson>): Lesson => ({ ...lessons[0], ...over });
function submission(over: Partial<{ lessonId: string; desiredDate: string }> = {}) {
	const target = lessons[0];
	return {
		idempotencyKey: 'synthetic-idempotency-key',
		parentFirstName: 'Synthetic',
		parentLastName: 'Parent',
		email: 'guest@example.test',
		phone: '+49 000000000',
		locale: 'de' as const,
		privacyVersion: 'trial-intake-retention-2026-09-16-v1' as const,
		children: [{ key: 'c1', firstName: 'Kind', lastName: 'Zulu', birthDate: '2020-02-29' }],
		items: [
			{
				lessonId: over.lessonId ?? target.id,
				desiredDate: over.desiredDate ?? nextLessonDate(target.weekday, NOW),
				childKeys: ['c1'],
			},
		],
	};
}

describe('closed lesson key', () => {
	it('ignores time, room, teacher and building so an ordinary schedule edit keeps the closure', () => {
		const base = lesson({ subject: 'Kunst', group: 'Kunst Mo 2A', weekday: 1 });
		const moved = lesson({
			...base,
			start: '18:00',
			end: '19:00',
			teacher: 'Andere Lehrkraft',
			room: 'R9',
			building: 'Villa',
		});
		expect(closedKey(moved)).toBe(closedKey(base));
	});
	it('normalises case and surrounding space', () => {
		expect(closedKey({ subject: ' KUNST ', group: 'Kunst Mo 2A', weekday: 1 })).toBe(
			closedKey({ subject: 'kunst', group: 'kunst mo 2a', weekday: 1 })
		);
	});
	it('separates the real group-name collisions of the published schedule', () => {
		// `1B` is both Russisch and Kunst on Friday; `3J Russisch` runs in two buildings on
		// different weekdays; `Mathe` runs on Monday and Tuesday. Closing one must not close all.
		const collisions: [
			Pick<Lesson, 'subject' | 'group' | 'weekday'>,
			Pick<Lesson, 'subject' | 'group' | 'weekday'>,
		][] = [
			[
				{ subject: 'Russisch', group: '1B', weekday: 5 },
				{ subject: 'Kunst', group: '1B', weekday: 5 },
			],
			[
				{ subject: 'Russisch', group: '3J Russisch', weekday: 2 },
				{ subject: 'Russisch', group: '3J Russisch', weekday: 6 },
			],
			[
				{ subject: 'Soroban-Abacus', group: 'Mathe', weekday: 1 },
				{ subject: 'Soroban-Abacus', group: 'Mathe', weekday: 2 },
			],
		];
		for (const [left, right] of collisions) expect(closedKey(left)).not.toBe(closedKey(right));
	});
});

describe('closed lesson submission', () => {
	it('refuses a closed lesson sent directly to the server', () => {
		expect(() => validateSubmission(submission(), lessons, NOW, [lessons[0].id])).toThrow(
			IntakeError
		);
		try {
			validateSubmission(submission(), lessons, NOW, [lessons[0].id]);
		} catch (error) {
			expect((error as IntakeError).code).toBe('INTAKE_LESSON_CLOSED');
			expect((error as IntakeError).status).toBe(409);
		}
	});
	it('accepts an open lesson while another one is closed', () => {
		const result = validateSubmission(submission(), lessons, NOW, [lessons[1].id]);
		expect(result.items[0].lesson.id).toBe(lessons[0].id);
	});
});
