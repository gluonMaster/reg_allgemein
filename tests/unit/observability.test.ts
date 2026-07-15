import { createSafeErrorLog, redactSensitive } from '$lib/server/observability/redaction';
import { getOrCreateRequestId } from '$lib/server/observability/request-id';

describe('request correlation and redaction', () => {
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
});
