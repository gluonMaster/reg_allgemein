const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const SENSITIVE_FIELD =
	/(address|body|content|cookie|document|email|ip|message|name|password|phone|secret|token)/i;
const EMAIL_VALUE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gi;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

function redactString(value: string): string {
	return value.replace(EMAIL_VALUE, REDACTED).replace(BEARER_VALUE, REDACTED);
}

export function redactSensitive(value: unknown, depth = 0): unknown {
	if (depth > 8) return TRUNCATED;
	if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'string') return redactString(value);
	if (Array.isArray(value))
		return value.slice(0, 50).map((entry) => redactSensitive(entry, depth + 1));
	if (typeof value !== 'object') return String(value);

	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.slice(0, 100)
			.map(([key, entry]) => [
				key,
				SENSITIVE_FIELD.test(key) ? REDACTED : redactSensitive(entry, depth + 1),
			])
	);
}

function safeErrorType(error: unknown): string {
	if (!(error instanceof Error)) return 'UnknownError';
	return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : 'Error';
}

export interface SafeErrorContext {
	requestId: string;
	method: string;
	routeId: string | null;
	status: number;
}

export function createSafeErrorLog(error: unknown, context: SafeErrorContext) {
	return {
		level: 'error',
		code: 'UNEXPECTED_SERVER_ERROR',
		errorType: safeErrorType(error),
		requestId: context.requestId,
		method: context.method,
		routeId: context.routeId,
		status: context.status,
	};
}

export function logServerError(error: unknown, context: SafeErrorContext): void {
	if (context.status < 500) return;

	console.error(JSON.stringify(createSafeErrorLog(error, context)));
}
