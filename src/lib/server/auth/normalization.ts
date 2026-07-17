export function normalizeEmail(value: string): string {
	return value.trim().toLocaleLowerCase('en-US');
}

export function normalizePersonName(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');
}

export function cleanDisplayText(value: string): string {
	return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}
