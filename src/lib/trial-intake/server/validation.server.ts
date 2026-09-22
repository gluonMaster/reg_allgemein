import { z } from 'zod';
import { INTAKE_PRIVACY_VERSION, type Lesson } from '../contracts';
import { berlinDate, weekday } from '../dates';
export { berlinDate, weekday, nextLessonDate } from '../dates';

export class IntakeError extends Error {
	constructor(
		readonly code: string,
		readonly status = 400
	) {
		super(code);
	}
}
export const textField = z
	.string()
	.trim()
	.min(1)
	.max(160)
	.transform((v) => v.normalize('NFC'))
	.refine((v) => !/[\u0000-\u001f\u007f]/u.test(v));
export const opaqueKey = z.string().regex(/^[A-Za-z0-9_-]{16,80}$/u);
export function calendarDate(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/u.test(value) &&
		!Number.isNaN(Date.parse(value)) &&
		new Date(value).toISOString().slice(0, 10) === value
	);
}
const dateField = z.string().refine(calendarDate);
export const intakeInputSchema = z
	.object({
		idempotencyKey: opaqueKey,
		parentFirstName: textField,
		parentLastName: textField,
		email: textField.pipe(z.email()).transform((v) => v.toLowerCase()),
		phone: textField.refine((v) => /^[+()\d .\/-]{5,160}$/u.test(v)),
		locale: z.enum(['de', 'ru']),
		privacyVersion: z.literal(INTAKE_PRIVACY_VERSION),
		children: z
			.array(
				z
					.object({
						key: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
						firstName: textField,
						lastName: textField,
						birthDate: dateField,
					})
					.strict()
			)
			.min(1)
			.max(10),
		items: z
			.array(
				z
					.object({
						lessonId: z.string().regex(/^[a-f0-9]{64}$/u),
						desiredDate: dateField,
						childKeys: z.array(z.string().min(1).max(64)).min(1).max(10),
					})
					.strict()
			)
			.min(1)
			.max(10),
	})
	.strict()
	.superRefine((data, ctx) => {
		const keys = new Set(data.children.map((c) => c.key));
		if (
			keys.size !== data.children.length ||
			new Set(data.items.map((i) => i.lessonId)).size !== data.items.length ||
			data.items.some(
				(i) =>
					new Set(i.childKeys).size !== i.childKeys.length ||
					i.childKeys.some((k) => !keys.has(k))
			)
		) {
			ctx.addIssue({ code: 'custom', message: 'Invalid assignments.' });
		}
	});
export function validateSubmission(
	value: unknown,
	lessons: readonly Lesson[],
	now: string,
	closedIds: readonly string[] = []
) {
	const parsed = intakeInputSchema.safeParse(value);
	if (!parsed.success) throw new IntakeError('INTAKE_INPUT_INVALID');
	const data = parsed.data;
	const today = berlinDate(now);
	if (data.children.some((c) => c.birthDate > today))
		throw new IntakeError('INTAKE_BIRTH_DATE_INVALID');
	const items = data.items.map((item) => {
		const lesson = lessons.find((l) => l.id === item.lessonId);
		if (!lesson) throw new IntakeError('INTAKE_LESSON_UNAVAILABLE', 409);
		// The form hides a full group; a direct POST is refused here.
		if (closedIds.includes(item.lessonId)) throw new IntakeError('INTAKE_LESSON_CLOSED', 409);
		if (item.desiredDate <= today || weekday(item.desiredDate) !== lesson.weekday) {
			throw new IntakeError('INTAKE_DATE_INVALID');
		}
		return { ...item, lesson };
	});
	return { data, items };
}
