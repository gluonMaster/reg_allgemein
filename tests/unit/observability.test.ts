import { vi } from 'vitest';
import {
	createSafeErrorLog,
	logServerError,
	redactSensitive,
} from '$lib/server/observability/redaction';
import { getOrCreateRequestId } from '$lib/server/observability/request-id';

describe('request correlation and redaction', () => {
	afterEach(() => vi.restoreAllMocks());

	it('keeps a safe upstream request ID and replaces an unsafe one', () => {
		expect(getOrCreateRequestId('trace_12345678')).toBe('trace_12345678');
		expect(getOrCreateRequestId('unsafe value')).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('redacts sensitive fields and values', () => {
		const redacted = redactSensitive({
			status: 'failed',
			email: 'person@example.org',
			nested: { authorization: 'Bearer very-secret-token', token: 'raw-token' },
		});
		const serialized = JSON.stringify(redacted);

		expect(serialized).toContain('failed');
		expect(serialized).not.toContain('person@example.org');
		expect(serialized).not.toContain('very-secret-token');
		expect(serialized).not.toContain('raw-token');
	});

	it('does not copy an error message or stack into the safe error record', () => {
		const record = createSafeErrorLog(new Error('person@example.org token=raw-secret'), {
			requestId: 'request_12345678',
			method: 'POST',
			routeId: '/private/[id]',
			status: 500,
		});
		const serialized = JSON.stringify(record);

		expect(serialized).toContain('request_12345678');
		expect(serialized).not.toContain('person@example.org');
		expect(serialized).not.toContain('raw-secret');
	});

	it('does not report an expected 404 as an unexpected server error', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		logServerError(new Error('missing resource'), {
			requestId: 'request_12345678',
			method: 'GET',
			routeId: null,
			status: 404,
		});

		expect(consoleError).not.toHaveBeenCalled();
	});

	it('reports a sanitized structured record for a real 5xx response', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		logServerError(new Error('person@example.org token=raw-secret'), {
			requestId: 'request_12345678',
			method: 'POST',
			routeId: '/private/[id]',
			status: 500,
		});

		expect(consoleError).toHaveBeenCalledOnce();
		const serialized = String(consoleError.mock.calls[0]?.[0]);
		expect(JSON.parse(serialized)).toEqual({
			level: 'error',
			code: 'UNEXPECTED_SERVER_ERROR',
			errorType: 'Error',
			requestId: 'request_12345678',
			method: 'POST',
			routeId: '/private/[id]',
			status: 500,
		});
		expect(serialized).not.toContain('person@example.org');
		expect(serialized).not.toContain('raw-secret');
	});
});
