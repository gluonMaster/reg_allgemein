import { ResendEmailProvider } from '$lib/server/email/resend';

const providerOptions = {
	apiKey: 're_' + 'x'.repeat(32),
	from: 'Kinder- und Elternzentrum Kolibri e.V. <registration@kolibri-dresden.de>',
	replyTo: 'registration@kolibri-dresden.de',
} as const;

describe('Resend email provider', () => {
	it('sends the approved identity, reply mailbox, plain text, and a pseudonymous idempotency key', async () => {
		let request: { input: RequestInfo | URL; init?: RequestInit } | undefined;
		const fetcher: typeof fetch = async (input, init) => {
			request = { input, init };
			return Response.json({ id: 'resend-request-1' });
		};
		const provider = new ResendEmailProvider({ ...providerOptions, fetcher });

		await expect(
			provider.send(
				{ to: 'parent@example.org', subject: 'Bestätigung', text: 'Nachricht' },
				{ idempotencyKey: 'email:registration:user-internal-1' }
			)
		).resolves.toEqual({ providerRequestId: 'resend-request-1' });

		expect(request).toBeDefined();
		expect(String(request!.input)).toBe('https://api.resend.com/emails');
		const headers = new Headers(request!.init?.headers);
		expect(headers.get('authorization')).toBe(`Bearer ${providerOptions.apiKey}`);
		expect(headers.get('idempotency-key')).toMatch(/^reg-allgemein\/[0-9a-f]{64}$/);
		expect(headers.get('idempotency-key')).not.toContain('user-internal-1');
		expect(JSON.parse(String(request!.init?.body))).toEqual({
			from: providerOptions.from,
			to: ['parent@example.org'],
			reply_to: providerOptions.replyTo,
			subject: 'Bestätigung',
			text: 'Nachricht',
		});
	});

	it('sends one bounded PDF attachment as Base64 and enforces the preview recipient hash', async () => {
		let body: Record<string, unknown> | undefined;
		const recipient = 'preview-parent@example.org';
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipient));
		const recipientHash = [...new Uint8Array(digest)]
			.map((value) => value.toString(16).padStart(2, '0'))
			.join('');
		const provider = new ResendEmailProvider({
			...providerOptions,
			allowedRecipientHashes: [recipientHash],
			fetcher: async (_input, init) => {
				body = JSON.parse(String(init?.body));
				return Response.json({ id: 'resend-with-pdf' });
			},
		});
		await expect(
			provider.send(
				{
					to: recipient.toUpperCase(),
					subject: '[TEST/ENTWURF] Vertrag',
					text: 'Synthetischer Test',
					attachments: [
						{
							filename: 'TEST-ENTWURF-Vertrag-K-100.pdf',
							content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
							contentType: 'application/pdf',
						},
					],
				},
				{ idempotencyKey: 'preview-contract-email-1' }
			)
		).resolves.toEqual({
			providerRequestId: 'resend-with-pdf',
		});
		expect(body?.attachments).toEqual([
			{
				filename: 'TEST-ENTWURF-Vertrag-K-100.pdf',
				content: 'JVBERg==',
			},
		]);
	});

	it('rejects a recipient outside the preview allowlist before the network request', async () => {
		let called = false;
		const provider = new ResendEmailProvider({
			...providerOptions,
			allowedRecipientHashes: ['a'.repeat(64)],
			fetcher: async () => {
				called = true;
				return Response.json({ id: 'unexpected' });
			},
		});
		await expect(
			provider.send(
				{ to: 'not-allowed@example.org', subject: 'A', text: 'B' },
				{ idempotencyKey: 'preview-recipient-denied' }
			)
		).rejects.toMatchObject({ code: 'RESEND_RECIPIENT_NOT_ALLOWLISTED', retryable: false });
		expect(called).toBe(false);
	});

	it('uses the same provider idempotency key for the same outbox identity', async () => {
		const keys: string[] = [];
		const fetcher: typeof fetch = async (_input, init) => {
			keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
			return Response.json({ id: 'resend-request-1' });
		};
		const provider = new ResendEmailProvider({ ...providerOptions, fetcher });
		const message = { to: 'parent@example.org', subject: 'A', text: 'B' };

		await provider.send(message, { idempotencyKey: 'stable-outbox-key' });
		await provider.send(message, { idempotencyKey: 'stable-outbox-key' });

		expect(keys).toHaveLength(2);
		expect(keys[0]).toBe(keys[1]);
	});

	it.each([
		{ status: 422, type: 'invalid_from_address', retryable: false },
		{ status: 409, type: 'invalid_idempotent_request', retryable: false },
		{ status: 409, type: 'concurrent_idempotent_requests', retryable: true },
		{ status: 429, type: 'rate_limit_exceeded', retryable: true },
		{ status: 429, type: 'daily_quota_exceeded', retryable: false },
		{ status: 500, type: 'internal_server_error', retryable: true },
	])('classifies Resend $status/$type without exposing provider details', async (example) => {
		const fetcher: typeof fetch = async () =>
			Response.json(
				{ type: example.type, message: 'parent@example.org provider diagnostic' },
				{ status: example.status }
			);
		const provider = new ResendEmailProvider({ ...providerOptions, fetcher });

		const operation = provider.send(
			{ to: 'parent@example.org', subject: 'A', text: 'B' },
			{ idempotencyKey: 'outbox-1' }
		);
		await expect(operation).rejects.toMatchObject({
			code: `RESEND_${example.type.toUpperCase()}`,
			retryable: example.retryable,
			message: 'External provider operation failed.',
		});
	});

	it('treats network and malformed success responses as safe retryable failures', async () => {
		const networkProvider = new ResendEmailProvider({
			...providerOptions,
			fetcher: async () => {
				throw new Error('network details');
			},
		});
		await expect(
			networkProvider.send(
				{ to: 'parent@example.org', subject: 'A', text: 'B' },
				{ idempotencyKey: 'outbox-1' }
			)
		).rejects.toMatchObject({ code: 'RESEND_NETWORK_FAILURE', retryable: true });

		const malformedProvider = new ResendEmailProvider({
			...providerOptions,
			fetcher: async () => Response.json({ unexpected: true }),
		});
		await expect(
			malformedProvider.send(
				{ to: 'parent@example.org', subject: 'A', text: 'B' },
				{ idempotencyKey: 'outbox-1' }
			)
		).rejects.toMatchObject({ code: 'RESEND_INVALID_RESPONSE', retryable: true });
	});

	it('fails closed before the request when the outbox idempotency identity is absent', async () => {
		let called = false;
		const provider = new ResendEmailProvider({
			...providerOptions,
			fetcher: async () => {
				called = true;
				return Response.json({ id: 'unexpected' });
			},
		});

		await expect(
			provider.send({ to: 'parent@example.org', subject: 'A', text: 'B' })
		).rejects.toMatchObject({ code: 'RESEND_IDEMPOTENCY_KEY_REQUIRED', retryable: false });
		expect(called).toBe(false);
	});
});
