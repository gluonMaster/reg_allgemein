import { normalizeImportText, normalizeLookupText } from '$lib/server/import/canonical';

export const MISSING_PRICE_KEY = 'MISSING_PRICE_KEY' as const;

export interface SubjectDurationComponent {
	subject: string | null;
	durationMinutes: number;
}

function collapseSpaces(value: string): string {
	return value.trim().replace(/\s+/gu, ' ');
}

function cleanLookupInput(value: string): string {
	return collapseSpaces(
		value
			.normalize('NFKC')
			.replace(/[\t\u00a0]/gu, ' ')
			.replace(/Klassse/giu, 'Klasse')
	)
		.replace(/[.,;:]+$/gu, '')
		.trim();
}

function normalizeGermanComparable(value: string): string {
	return value
		.replaceAll('ä', 'ae')
		.replaceAll('ö', 'oe')
		.replaceAll('ü', 'ue')
		.replaceAll('ß', 'ss');
}

function canonicalLookupText(value: string): string {
	return collapseSpaces(
		normalizeGermanComparable(cleanLookupInput(value).toLocaleLowerCase('de-DE')).replace(
			/[\/\\.,;:()\-_]+/gu,
			' '
		)
	);
}

function beginsWithPhrase(value: string, phrase: string): boolean {
	return value === phrase || value.startsWith(`${phrase} `);
}

function containsPhrase(value: string, phrase: string): boolean {
	return ` ${value} `.includes(` ${phrase} `);
}

function isKnownMissingPattern(value: string): boolean {
	return (
		beginsWithPhrase(value, 'tanz ukr') ||
		value.startsWith('nachhilfe') ||
		beginsWithPhrase(value, 'nh') ||
		beginsWithPhrase(value, 'ind') ||
		value.startsWith('individ') ||
		value.startsWith('individuell') ||
		beginsWithPhrase(value, 'psychologische beratung') ||
		value.startsWith('psycholog') ||
		value.startsWith('orchester') ||
		value.startsWith('orhester') ||
		value.startsWith('vspe')
	);
}

export function startsWithJahrige(value: string): boolean {
	const cleaned = cleanLookupInput(value).toLocaleUpperCase('de-DE');
	return /^[34]\s*(?:-\s*\d\s*)?J(?:AHRIGE)?(?:\s|\(|$)/u.test(cleaned);
}

export function extractNumberLetterKey(value: string): string | null {
	if (startsWithJahrige(value)) return null;
	const match = /^(\d+)\s*([A-Za-z])/u.exec(cleanLookupInput(value));
	return match ? `${match[1]}${match[2].toUpperCase()}` : null;
}

/**
 * Curated port of NormalizePriceLookupKey. It intentionally excludes the VBA
 * calculation fallbacks, scaling, component sums and automatic discounts.
 */
export function normalizePriceLookupKey(groupName: string): string | typeof MISSING_PRICE_KEY {
	const cleaned = cleanLookupInput(groupName);
	const comparable = canonicalLookupText(cleaned);
	if (!comparable || isKnownMissingPattern(comparable)) return MISSING_PRICE_KEY;

	const firstToken = cleaned.split(' ', 1)[0];
	if (/^Ukrainisch_Musik_/iu.test(cleaned) || /^Ukrainisch_/iu.test(cleaned)) {
		return firstToken;
	}

	if (beginsWithPhrase(comparable, 'mathe abakus')) return 'Mathe Abakus';
	if (beginsWithPhrase(comparable, 'soroban abakus')) return 'Mathe Abakus';
	if (beginsWithPhrase(comparable, 'ru fremd') || containsPhrase(comparable, 'ru fremd')) {
		return 'Ru/Fremd.';
	}
	if (beginsWithPhrase(comparable, 'deu engl arab')) return 'Deutsch';
	if (beginsWithPhrase(comparable, 'kunststudio')) return 'KunstStudio';
	if (beginsWithPhrase(comparable, 'mathematik')) return 'Mathe';
	if (beginsWithPhrase(comparable, 'schachclub')) return 'Schach';
	if (beginsWithPhrase(comparable, 'tanzkurs')) return 'Tanz';
	if (comparable === 'ukrainisch') return 'Ukrainisch';
	if (comparable === 'ukrainisch musik') return 'Ukrainisch_Musik';

	if (startsWithJahrige(cleaned)) return cleaned.trim().startsWith('3') ? '3Jahrige' : '4Jahrige';
	const classKey = extractNumberLetterKey(cleaned);
	if (classKey) return classKey;

	const aliases: Record<string, string> = {
		baby: 'Baby',
		deutsch: 'Deutsch',
		gitarre: 'Gitarre',
		kleingruppe: 'Kleingruppe',
		kunst: 'Kunst',
		kunststudio: 'KunstStudio',
		logoritmik: 'Logoritmik',
		mathe: 'Mathe',
		musik: 'Musik',
		russisch: 'Russisch',
		schach: 'Schach',
		tanz: 'Tanz',
		theater: 'Theater',
	};
	return aliases[comparable.split(' ', 1)[0]] ?? MISSING_PRICE_KEY;
}

export function normalizePricingSubject(subject: string): string | null {
	const comparable = canonicalLookupText(subject);
	if (!comparable) return null;
	const tokens = new Set(comparable.split(' '));
	if (tokens.has('log') || tokens.has('logoritmik')) return 'log';
	if (tokens.has('ru') || tokens.has('russisch')) return 'russisch';
	if (tokens.has('ku') || tokens.has('kunst')) return 'kunst';
	if (tokens.has('ma') || tokens.has('mathe') || tokens.has('mathematik')) return 'mathe';
	if (tokens.has('mu') || tokens.has('musik')) return 'musik';
	if (tokens.has('schach')) return 'schach';
	if (tokens.has('ukr') || tokens.has('ukrainisch')) return 'ukrainisch';
	return normalizeLookupText(normalizeImportText(subject));
}

export function normalizeSubjectList(subjects: readonly string[]): string[] {
	const result: string[] = [];
	for (const subject of subjects) {
		const normalized = normalizePricingSubject(subject);
		if (normalized && !result.includes(normalized)) result.push(normalized);
	}
	return result;
}

export function buildScalarSubjectDurationVector(
	subjects: readonly string[],
	durationMinutes: number
): SubjectDurationComponent[] {
	if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
		throw new TypeError('durationMinutes must be a positive integer.');
	}
	const normalizedSubjects = normalizeSubjectList(subjects);
	if (!normalizedSubjects.length) return [{ subject: null, durationMinutes }];
	return normalizedSubjects.map((subject) => ({ subject, durationMinutes }));
}

export function normalizeSubjectDurationVector(
	vector: readonly SubjectDurationComponent[]
): SubjectDurationComponent[] {
	if (!vector.length) throw new TypeError('A pricing vector cannot be empty.');
	return vector.map((component) => {
		if (!Number.isSafeInteger(component.durationMinutes) || component.durationMinutes <= 0) {
			throw new TypeError('Every vector duration must be a positive integer.');
		}
		return {
			subject: component.subject === null ? null : normalizePricingSubject(component.subject),
			durationMinutes: component.durationMinutes,
		};
	});
}

export function normalizedRuleKey(priceKey: string): string | null {
	const key = normalizePriceLookupKey(priceKey);
	return key === MISSING_PRICE_KEY ? null : normalizeLookupText(key);
}
