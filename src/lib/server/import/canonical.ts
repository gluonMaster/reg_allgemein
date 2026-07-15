import { sha256Hex } from '$lib/server/security/digest';

function normalizeCanonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, normalizeCanonicalValue(child)])
		);
	}
	return value;
}

export function canonicalJson(value: unknown): string {
	return JSON.stringify(normalizeCanonicalValue(value));
}

export function normalizeImportText(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function normalizeLookupText(value: string): string {
	return normalizeImportText(value).toLocaleLowerCase('de-DE');
}

export async function hashCanonical(value: unknown): Promise<string> {
	return sha256Hex(canonicalJson(value));
}

export async function buildDependencySet(input: Record<string, string>): Promise<{
	canonical: Record<string, string>;
	hashSha256: string;
}> {
	const canonical = Object.fromEntries(
		Object.entries(input).sort(([a], [b]) => a.localeCompare(b))
	);
	return { canonical, hashSha256: await hashCanonical(canonical) };
}

export async function buildRunFingerprint(input: {
	sourceKind: string;
	academicPeriodId: string;
	sourceHashSha256: string;
	dependencySetHashSha256: string;
}): Promise<string> {
	return hashCanonical(input);
}
