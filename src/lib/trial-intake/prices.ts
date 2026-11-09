/** WL-05: from 0,01 to 1000,00 € per child and month, threshold 1-30 children. */
export const PRICE_MAX_CENTS = 100_000;
export const MIN_PARTICIPANTS_DEFAULT = 3;
export const MIN_PARTICIPANTS_MAX = 30;
/**
 * "66,50", "66.5" and "66" give 6650 without binary arithmetic. A thousands separator is not
 * accepted: "1.000" would be read as one euro. A trailing euro sign is tolerated.
 */
export function parseEuroCents(value: string): number | null {
	const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/u.exec(value.trim().replace(/\s*€$/u, ''));
	if (!match) return null;
	const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
	return cents >= 1 && cents <= PRICE_MAX_CENTS ? cents : null;
}
export function parseMinParticipants(value: string): number | null {
	const match = /^\d{1,2}$/u.exec(value.trim());
	const count = match ? Number(match[0]) : 0;
	return count >= 1 && count <= MIN_PARTICIPANTS_MAX ? count : null;
}
/** The plain German amount of a form field or CSV cell, e.g. "66,50". */
export function centsText(cents: number, separator = ','): string {
	return `${Math.floor(cents / 100)}${separator}${String(cents % 100).padStart(2, '0')}`;
}
