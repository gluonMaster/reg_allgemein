import {
	REMOTE_D1_MAX_RESPONSE_BYTES,
	RemoteD1Boundary,
	RemoteD1Error,
	assertRemoteD1ConfigTarget,
	expectedRemoteImportConfirmation,
} from '../../scripts/remote-d1-target';

const productionId = '11111111-1111-4111-8111-111111111111';
const previewId = '22222222-2222-4222-8222-222222222222';
const accountId = 'a'.repeat(32);

function config(environment: 'preview' | 'production') {
	return {
		account_id: accountId,
		vars: { APP_ENV: environment, SECRET_MUST_NOT_BE_USED: 'synthetic-secret' },
		d1_databases: [
			{
				binding: 'DB',
				database_name: 'portal-database',
				database_id: environment === 'preview' ? previewId : productionId,
			},
		],
	};
}

function successfulResponse(results: unknown[][], singleResult = false): Response {
	const mapped = results.map((rows) => ({ success: true, results: rows, meta: { changes: 0 } }));
	return new Response(
		JSON.stringify({
			success: true,
			result: singleResult ? mapped[0] : mapped,
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	);
}

describe('exact-target remote D1 boundary', () => {
	it('accepts dedicated deployed targets and rejects target or selector mismatch', () => {
		expect(assertRemoteD1ConfigTarget(config('preview'), 'preview', previewId)).toEqual({
			environment: 'preview',
			accountId,
			databaseId: previewId,
		});
		expect(
			assertRemoteD1ConfigTarget(config('production'), 'production', productionId)
		).toEqual({
			environment: 'production',
			accountId,
			databaseId: productionId,
		});
		expect(() =>
			assertRemoteD1ConfigTarget(config('preview'), 'preview', productionId)
		).toThrow('CLI_DATABASE_TARGET_MISMATCH');
		expect(() =>
			assertRemoteD1ConfigTarget(
				{
					...config('production'),
					d1_databases: [
						{
							binding: 'DB',
							database_name: productionId,
							database_id: productionId,
						},
					],
				},
				'production',
				productionId
			)
		).toThrow('CLI_DATABASE_SELECTOR_AMBIGUOUS');
	});

	it('rejects Wrangler dev overlays, shared identities and placeholder targets', () => {
		expect(() =>
			assertRemoteD1ConfigTarget(
				{
					...config('preview'),
					d1_databases: [
						{
							binding: 'DB',
							database_id: productionId,
							preview_database_id: previewId,
						},
					],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_DATABASE_SELECTOR_AMBIGUOUS');
		expect(() =>
			assertRemoteD1ConfigTarget(
				{
					...config('preview'),
					d1_databases: [
						{
							binding: 'DB',
							database_id: previewId,
							preview_database_id: previewId,
						},
					],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_REMOTE_DATABASE_ISOLATION_REQUIRED');
		expect(() =>
			assertRemoteD1ConfigTarget(
				{
					...config('preview'),
					d1_databases: [{ binding: 'DB', database_id: 'replace-me' }],
				},
				'preview',
				previewId
			)
		).toThrow('CLI_DATABASE_ID_INVALID');
	});

	it('accepts the documented single-query response object as well as a batch array', async () => {
		const boundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () => successfulResponse([[{ count: 1 }]], true)) as typeof fetch
		);
		await expect(
			boundary.first<{ count: number }>({ sql: 'SELECT 1 AS count' })
		).resolves.toEqual({ count: 1 });
	});

	it('binds destructive confirmation to action, environment, UUID and reviewed digest', () => {
		expect(
			expectedRemoteImportConfirmation({
				action: 'promote',
				target: { environment: 'production', databaseId: productionId },
				bindingDigestSha256: 'b'.repeat(64),
			})
		).toBe(`LEGACY_IMPORT_PROMOTE_PRODUCTION_${productionId}_${'b'.repeat(64)}`);
	});

	it('sends parameterized batches to the exact database without serializing the token in data', async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const fakeFetch: typeof fetch = async (url, init) => {
			requests.push({ url: String(url), init });
			return successfulResponse([[{ count: 1 }]]);
		};
		const boundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			fakeFetch
		);

		await expect(
			boundary.first<{ count: number }>({ sql: 'SELECT ? AS count', params: [1] })
		).resolves.toEqual({ count: 1 });
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toContain(`/database/${previewId}/query`);
		expect(requests[0].init?.headers).toMatchObject({
			Authorization: 'Bearer synthetic-token',
		});
		expect(requests[0].init?.body).toBe(
			JSON.stringify({ batch: [{ sql: 'SELECT ? AS count', params: [1] }] })
		);
		expect(requests[0].init?.body).not.toContain('synthetic-token');
		expect(JSON.stringify(boundary)).not.toContain('synthetic-token');
		expect(Object.values(boundary)).not.toContain('synthetic-token');
	});

	it('aborts a bounded request and preserves ambiguous write classification', async () => {
		let observedSignal: AbortSignal | undefined;
		const boundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-timeout-token',
			((_url, init) => {
				observedSignal = init?.signal ?? undefined;
				return new Promise<Response>((_resolve, reject) => {
					observedSignal?.addEventListener('abort', () => reject(new Error('aborted')), {
						once: true,
					});
				});
			}) as typeof fetch,
			100
		);
		await expect(boundary.run({ sql: 'UPDATE example SET value = 1' })).rejects.toMatchObject({
			code: 'REMOTE_D1_DELIVERY_AMBIGUOUS',
			delivery: 'ambiguous',
		});
		expect(observedSignal?.aborted).toBe(true);
	});

	it('retries reads but reports a write transport loss as ambiguous without blind replay', async () => {
		let readAttempts = 0;
		const readBoundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () => {
				readAttempts += 1;
				if (readAttempts < 3) throw new Error('synthetic network failure');
				return successfulResponse([[{ ok: 1 }]]);
			}) as typeof fetch
		);
		await expect(readBoundary.first({ sql: 'SELECT 1 AS ok' })).resolves.toEqual({ ok: 1 });
		expect(readAttempts).toBe(3);

		let writeAttempts = 0;
		const writeBoundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () => {
				writeAttempts += 1;
				throw new Error('synthetic network failure');
			}) as typeof fetch
		);
		await expect(
			writeBoundary.run({ sql: 'UPDATE example SET value = 1' })
		).rejects.toMatchObject({
			code: 'REMOTE_D1_DELIVERY_AMBIGUOUS',
			delivery: 'ambiguous',
		} satisfies Partial<RemoteD1Error>);
		expect(writeAttempts).toBe(1);
	});

	it('treats a malformed successful write response as ambiguous', async () => {
		const boundary = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () =>
				new Response(JSON.stringify({ success: true, result: { unexpected: true } }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})) as typeof fetch
		);
		await expect(boundary.run({ sql: 'UPDATE example SET value = 1' })).rejects.toMatchObject({
			code: 'REMOTE_D1_DELIVERY_AMBIGUOUS',
			delivery: 'ambiguous',
		});
	});

	it('rejects declared and streamed oversized responses without exposing their body', async () => {
		let declaredAttempts = 0;
		const declaredRead = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () => {
				declaredAttempts += 1;
				return new Response('{}', {
					status: 200,
					headers: { 'Content-Length': String(REMOTE_D1_MAX_RESPONSE_BYTES + 1) },
				});
			}) as typeof fetch
		);
		await expect(declaredRead.all({ sql: 'SELECT 1' })).rejects.toMatchObject({
			code: 'REMOTE_D1_RESULT_INVALID',
			delivery: 'definite_failure',
		});
		expect(declaredAttempts).toBe(1);

		const streamedWrite = new RemoteD1Boundary(
			{ accountId, databaseId: previewId },
			'synthetic-token',
			(async () =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new Uint8Array(REMOTE_D1_MAX_RESPONSE_BYTES));
							controller.enqueue(new Uint8Array(1));
							controller.close();
						},
					}),
					{ status: 200 }
				)) as typeof fetch
		);
		await expect(
			streamedWrite.run({ sql: 'UPDATE example SET value = 1' })
		).rejects.toMatchObject({
			code: 'REMOTE_D1_DELIVERY_AMBIGUOUS',
			delivery: 'ambiguous',
		});
	});
});
