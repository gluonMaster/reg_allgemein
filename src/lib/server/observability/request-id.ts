const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function getOrCreateRequestId(candidate: string | null | undefined): string {
	return candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : crypto.randomUUID();
}
