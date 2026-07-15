import { parse } from 'node-html-parser';
import { z } from 'zod';
import { hashCanonical, normalizeImportText, normalizeLookupText } from '../canonical';
import { ImportContractError } from '../errors';
import type {
	ImportIssueDraft,
	LessonKind,
	ScheduleBlockDraft,
	ScheduleImportSnapshot,
} from '../types';

const SOURCE_NAMESPACE = 'primary' as const;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_CODES = {
	Mo: 'MO',
	Di: 'TU',
	Mi: 'WE',
	Do: 'TH',
	Fr: 'FR',
	Sa: 'SA',
	So: 'SU',
} as const;
const HTML_DAY_NAMES: Record<string, ScheduleBlockDraft['dayCode']> = {
	montag: 'MO',
	dienstag: 'TU',
	mittwoch: 'WE',
	donnerstag: 'TH',
	freitag: 'FR',
	samstag: 'SA',
	sonntag: 'SU',
};

const scheduleBlockSchema = z
	.object({
		id: z.string().trim().min(1),
		day: z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']),
		building: z.string().trim().min(1),
		room: z.string().trim().min(1),
		start_time: z.string().regex(TIME_PATTERN),
		end_time: z.string().regex(TIME_PATTERN),
		lesson_type: z.string().trim().min(1),
		subject: z.string().trim().min(1),
		teacher: z.string().trim().min(1),
		students: z.string().trim().min(1),
		room_display: z.string().trim().min(1),
	})
	.strict();

const scheduleSchema = z
	.object({
		schema_version: z.literal(1),
		generation_id: z.string().trim().min(1),
		generated_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
		source: z.string().trim().min(1),
		blocks: z.array(scheduleBlockSchema).min(1),
	})
	.strict();

type ScheduleSource = z.infer<typeof scheduleSchema>;

function shapeOf(value: unknown): unknown {
	if (Array.isArray(value))
		return { type: 'array', item: value.length ? shapeOf(value[0]) : 'empty' };
	if (value && typeof value === 'object') {
		return {
			type: 'object',
			fields: Object.fromEntries(
				Object.entries(value as Record<string, unknown>)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([key, child]) => [
						key,
						Array.isArray(child) ? 'array' : child === null ? 'null' : typeof child,
					])
			),
		};
	}
	return value === null ? 'null' : typeof value;
}

function minutesFromTime(value: string): number {
	const [hours, minutes] = value.split(':').map(Number);
	return hours * 60 + minutes;
}

function classifyLesson(block: ScheduleSource['blocks'][number]): {
	lessonKind: LessonKind;
	catalogStatus: 'published' | 'needs_review';
	requiresAdminApproval: boolean;
	capacityDefault: number | null;
} {
	const combined = normalizeLookupText(`${block.lesson_type} ${block.subject} ${block.students}`);
	if (/planung|placeholder|unbekannt|unknown/.test(combined)) {
		return {
			lessonKind: 'needs_review',
			catalogStatus: 'needs_review',
			requiresAdminApproval: true,
			capacityDefault: null,
		};
	}
	if (/tanz/.test(combined) || normalizeLookupText(block.lesson_type) === 'dance_group') {
		return {
			lessonKind: 'dance_group',
			catalogStatus: 'published',
			requiresAdminApproval: false,
			capacityDefault: 15,
		};
	}
	if (/nachhilfe/.test(combined) || normalizeLookupText(block.lesson_type) === 'nachhilfe') {
		return {
			lessonKind: 'nachhilfe',
			catalogStatus: 'published',
			requiresAdminApproval: true,
			capacityDefault: 1,
		};
	}
	if (
		/(^|\s)ind\.(\s|$)/.test(combined) ||
		normalizeLookupText(block.lesson_type) === 'individual'
	) {
		return {
			lessonKind: 'individual',
			catalogStatus: 'published',
			requiresAdminApproval: true,
			capacityDefault: 1,
		};
	}
	if (normalizeLookupText(block.lesson_type) === 'group') {
		return {
			lessonKind: 'group',
			catalogStatus: 'published',
			requiresAdminApproval: false,
			capacityDefault: 12,
		};
	}
	return {
		lessonKind: 'needs_review',
		catalogStatus: 'needs_review',
		requiresAdminApproval: true,
		capacityDefault: null,
	};
}

function stripHtmlLabel(value: string): string {
	return normalizeLookupText(value).replace(/^[^:]{1,30}:\s*/, '');
}

function htmlDayCode(value: string): ScheduleBlockDraft['dayCode'] | null {
	const normalized = normalizeLookupText(value);
	return Object.entries(HTML_DAY_NAMES).find(([name]) => normalized.includes(name))?.[1] ?? null;
}

function compareHtmlReference(
	html: string,
	blocks: ScheduleBlockDraft[]
): {
	blocksCompared: number;
	blocksMatched: number;
	issue?: ImportIssueDraft;
	htmlShape: Record<string, number>;
} {
	const root = parse(html);
	const htmlShape = Object.fromEntries(
		[
			'day-column',
			'day-header',
			'lesson-block',
			'lesson-time',
			'lesson-group',
			'lesson-teacher',
			'lesson-location',
			'lesson-subject',
		].map((className) => [className, root.querySelectorAll(`.${className}`).length])
	);
	const candidates: Array<{
		dayCode: ScheduleBlockDraft['dayCode'] | null;
		startTime: string | null;
		endTime: string | null;
		displayName: string;
		teacher: string;
		location: string;
		subject: string;
	}> = [];

	for (const dayColumn of root.querySelectorAll('.day-column')) {
		const dayCode = htmlDayCode(dayColumn.querySelector('.day-header')?.textContent ?? '');
		for (const lesson of dayColumn.querySelectorAll('.lesson-block')) {
			const timeText = normalizeImportText(
				lesson.querySelector('.lesson-time')?.textContent ?? ''
			);
			const time = /(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/.exec(timeText);
			candidates.push({
				dayCode,
				startTime: time?.[1] ?? null,
				endTime: time?.[2] ?? null,
				displayName: stripHtmlLabel(
					lesson.querySelector('.lesson-group')?.textContent ?? ''
				),
				teacher: stripHtmlLabel(lesson.querySelector('.lesson-teacher')?.textContent ?? ''),
				location: normalizeLookupText(
					lesson.querySelector('.lesson-location')?.textContent ?? ''
				),
				subject: stripHtmlLabel(lesson.querySelector('.lesson-subject')?.textContent ?? ''),
			});
		}
	}

	const used = new Set<string>();
	let matched = 0;
	let ambiguous = 0;
	for (const candidate of candidates) {
		const matches = blocks.filter(
			(block) =>
				!used.has(block.sourceBlockId) &&
				candidate.dayCode === block.dayCode &&
				candidate.startTime === block.startTime &&
				candidate.endTime === block.endTime &&
				candidate.displayName === normalizeLookupText(block.displayName) &&
				candidate.teacher === normalizeLookupText(block.teacher) &&
				candidate.location.includes(normalizeLookupText(block.building)) &&
				candidate.location.includes(normalizeLookupText(block.room)) &&
				(!candidate.subject || candidate.subject === normalizeLookupText(block.subject))
		);
		if (matches.length === 1) {
			used.add(matches[0].sourceBlockId);
			matched += 1;
		} else if (matches.length > 1) {
			ambiguous += 1;
		}
	}

	const matchesContract =
		candidates.length === blocks.length && matched === blocks.length && ambiguous === 0;
	return {
		blocksCompared: candidates.length,
		blocksMatched: matched,
		htmlShape,
		issue: matchesContract
			? undefined
			: {
					severity: 'fatal',
					code: 'SCHEDULE_HTML_COMPARISON_FAILED',
					safeContext: {
						jsonBlockCount: blocks.length,
						htmlBlockCount: candidates.length,
						matchedBlockCount: matched,
						ambiguousBlockCount: ambiguous,
					},
					blocksPromotion: true,
				},
	};
}

export async function parseScheduleSnapshot(input: {
	jsonText: string;
	htmlText: string;
}): Promise<ScheduleImportSnapshot> {
	let raw: unknown;
	try {
		raw = JSON.parse(input.jsonText);
	} catch (cause) {
		throw new ImportContractError({
			code: 'SCHEDULE_JSON_INVALID',
			structuralFingerprintSha256: await hashCanonical({ readableJson: false }),
			cause,
		});
	}
	const jsonShape = shapeOf(raw);
	const parsed = scheduleSchema.safeParse(raw);
	if (!parsed.success) {
		throw new ImportContractError({
			code: 'SCHEDULE_SCHEMA_UNSUPPORTED',
			structuralFingerprintSha256: await hashCanonical({ jsonShape }),
			safeContext: {
				issueCount: parsed.error.issues.length,
				paths: parsed.error.issues
					.slice(0, 10)
					.map((issue) => issue.path.map(String).join('.')),
			},
		});
	}

	const duplicateIds = new Map<string, number>();
	for (const block of parsed.data.blocks)
		duplicateIds.set(block.id, (duplicateIds.get(block.id) ?? 0) + 1);
	const duplicateCount = [...duplicateIds.values()].filter((count) => count > 1).length;
	if (duplicateCount) {
		throw new ImportContractError({
			code: 'SCHEDULE_BLOCK_ID_AMBIGUOUS',
			structuralFingerprintSha256: await hashCanonical({ jsonShape }),
			safeContext: { duplicateIdCount: duplicateCount },
		});
	}

	const blocks: ScheduleBlockDraft[] = [];
	const issues: ImportIssueDraft[] = [];
	for (const source of parsed.data.blocks) {
		const startMinutes = minutesFromTime(source.start_time);
		const endMinutes = minutesFromTime(source.end_time);
		if (endMinutes <= startMinutes) {
			throw new ImportContractError({
				code: 'SCHEDULE_DURATION_NOT_POSITIVE',
				structuralFingerprintSha256: await hashCanonical({ jsonShape }),
				safeContext: { invalidBlockCount: 1 },
			});
		}
		const classification = classifyLesson(source);
		const sourceOfferingKey = `schedule:${SOURCE_NAMESPACE}:${source.id}`;
		const block: ScheduleBlockDraft = {
			sourceNamespace: SOURCE_NAMESPACE,
			sourceBlockId: source.id,
			sourceOfferingKey,
			sourceBlockHashSha256: await hashCanonical(source),
			displayName: normalizeImportText(source.students),
			lessonKind: classification.lessonKind,
			subject: normalizeImportText(source.subject),
			dayCode: DAY_CODES[source.day],
			startTime: source.start_time,
			endTime: source.end_time,
			durationMinutes: endMinutes - startMinutes,
			teacher: normalizeImportText(source.teacher),
			building: normalizeImportText(source.building),
			room: normalizeImportText(source.room),
			locationDisplay: normalizeImportText(source.room_display),
			catalogStatus: classification.catalogStatus,
			requiresAdminApproval: classification.requiresAdminApproval,
			capacityDefault: classification.capacityDefault,
		};
		blocks.push(block);
		if (classification.lessonKind === 'needs_review') {
			issues.push({
				severity: 'warning',
				code: 'SCHEDULE_LESSON_KIND_NEEDS_REVIEW',
				sourceRecordKey: sourceOfferingKey,
				safeContext: { sourceBlockHashSha256: block.sourceBlockHashSha256 },
				blocksPromotion: false,
			});
		}
	}

	const htmlComparison = compareHtmlReference(input.htmlText, blocks);
	const structuralFingerprintSha256 = await hashCanonical({
		jsonShape,
		htmlShape: htmlComparison.htmlShape,
	});
	if (htmlComparison.issue) {
		throw new ImportContractError({
			code: htmlComparison.issue.code,
			structuralFingerprintSha256,
			safeContext: htmlComparison.issue.safeContext,
		});
	}

	const displayCounts = new Map<string, number>();
	for (const block of blocks) {
		const normalized = normalizeLookupText(block.displayName);
		displayCounts.set(normalized, (displayCounts.get(normalized) ?? 0) + 1);
	}
	const duplicateNames = [...displayCounts.values()].filter((count) => count > 1);
	if (duplicateNames.length) {
		issues.push({
			severity: 'info',
			code: 'SCHEDULE_DUPLICATE_DISPLAY_NAMES_PRESERVED',
			safeContext: {
				duplicateDisplayNameCount: duplicateNames.length,
				affectedBlockCount: duplicateNames.reduce((sum, count) => sum + count, 0),
			},
			blocksPromotion: false,
		});
	}

	const versionHashSha256 = await hashCanonical({
		contract: 'schedule-json:1',
		schemaVersion: parsed.data.schema_version,
		generationId: parsed.data.generation_id,
		generatedAt: parsed.data.generated_at,
		blocks: [...blocks]
			.sort((left, right) => left.sourceBlockId.localeCompare(right.sourceBlockId))
			.map((block) => ({
				sourceBlockId: block.sourceBlockId,
				sourceBlockHashSha256: block.sourceBlockHashSha256,
				lessonKind: block.lessonKind,
				catalogStatus: block.catalogStatus,
			})),
	});

	return {
		sourceContractId: 'schedule-json',
		sourceContractVersion: 1,
		structuralFingerprintSha256,
		versionHashSha256,
		schemaVersion: 1,
		generationId: parsed.data.generation_id,
		generatedAt: new Date(parsed.data.generated_at).toISOString(),
		blocks,
		issues,
		rowsTotal: blocks.length,
		rowsStaged: blocks.length,
		rowsSkipped: 0,
		htmlComparison: {
			blocksCompared: htmlComparison.blocksCompared,
			blocksMatched: htmlComparison.blocksMatched,
		},
	};
}
