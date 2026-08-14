import {
	parseTelegramProviderCheckArguments,
	runTelegramProviderCheck,
	telegramProviderCheckFailure,
	TELEGRAM_PREFLIGHT_CONFIRMATION,
	TELEGRAM_PREVIEW_CREDENTIALS_CONFIRMATION,
	TelegramProviderCheckError,
	type TelegramProviderCheckEnvironment,
} from '../../scripts/telegram-provider-check';
import {
	parseTelegramPreviewTargetCreateArguments,
	TELEGRAM_TARGET_CREATE_CONFIRMATION,
} from '../../scripts/telegram-preview-target-create';
import {
	parseTelegramDeploymentEvidenceCreateArguments,
	TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION,
} from '../../scripts/telegram-preview-deployment-evidence-create';
import {
	buildTelegramPreviewDeploymentEvidence,
	telegramBotIdHmacSha256,
	telegramChatIdHmacSha256,
	telegramPreviewDeploymentEvidenceSha256,
	buildTelegramPreviewTargetDraft,
	verifyTelegramPreviewTarget,
	verifyTelegramPreviewDeploymentEvidence,
	TelegramPreviewTargetError,
} from '../../scripts/telegram-preview-target';

const token = `123456:${'A'.repeat(30)}`;
const chatId = '-1001234567890';
const bindingKey = 'preview-binding-key-'.padEnd(48, 'K');
const config = {
	name: 'kolibri-registration-preview',
	account_id: 'a'.repeat(32),
	vars: {
		APP_ENV: 'preview',
		PORTAL_PUBLIC_ORIGIN: 'https://preview.portal.example.test',
		AUTH_PUBLIC_ENABLED: 'false',
		CONTRACT_SEND_ENABLED: 'false',
		SCHEDULED_JOBS_ENABLED: 'false',
		EMAIL_PROVIDER: 'disabled',
		TELEGRAM_PROVIDER: 'bot_api',
		TELEGRAM_CHAT_TYPE: 'channel',
		TELEGRAM_BOT_API_TIMEOUT_MS: '10000',
		TELEGRAM_MAX_ATTEMPTS: '5',
		OUTBOX_LEASE_SECONDS: '60',
		OUTBOX_RETRY_BASE_SECONDS: '60',
		OUTBOX_RETRY_MAX_SECONDS: '3600',
		TELEGRAM_BUSINESS_TIMEZONE: 'Europe/Berlin',
		TELEGRAM_BUSINESS_HOURS: 'Mo-Fr 09:00-17:00',
		TELEGRAM_ACTIVATION_AT: '2026-08-13T09:00:00.000Z',
	},
	d1_databases: [
		{
			binding: 'DB',
			database_name: 'kolibri-registration-preview',
			database_id: '11111111-1111-4111-8111-111111111111',
		},
	],
};
const binding = {
	appEnvironment: 'preview' as const,
	workerName: 'kolibri-registration-preview',
	accountId: 'a'.repeat(32),
	databaseName: 'kolibri-registration-preview',
	databaseId: '11111111-1111-4111-8111-111111111111',
	portalPublicOrigin: 'https://preview.portal.example.test',
	authPublicEnabled: false as const,
	contractSendEnabled: false as const,
	scheduledJobsEnabled: false as const,
	emailProvider: 'disabled' as const,
	telegramProvider: 'bot_api' as const,
	telegramChatType: 'channel' as const,
	telegramBotApiTimeoutMs: 10_000,
	telegramMaxAttempts: 5,
	outboxLeaseSeconds: 60,
	outboxRetryBaseSeconds: 60,
	outboxRetryMaxSeconds: 3_600,
	telegramBusinessTimezone: 'Europe/Berlin',
	telegramBusinessHours: 'Mo-Fr 09:00-17:00',
	telegramActivationAt: '2026-08-13T09:00:00.000Z',
};
const deploymentEvidence = {
	schemaVersion: 1 as const,
	purpose: 'telegram-preview-deployment-observation' as const,
	accountId: 'a'.repeat(32),
	workerName: 'kolibri-registration-preview',
	workerVersionId: '2'.repeat(32),
	candidateGitCommitSha: '1'.repeat(40),
	observedAt: '2026-08-13T07:30:00.000Z',
	observedBy: 'independent-deploy-observer',
};
const manifest = {
	schemaVersion: 1 as const,
	purpose: 'telegram-preview-smoke' as const,
	binding,
	chatIdHmacSha256: telegramChatIdHmacSha256(chatId, bindingKey),
	botIdHmacSha256: telegramBotIdHmacSha256(token, bindingKey),
	candidateGitCommitSha: '1'.repeat(40),
	deployedWorkerVersionId: '2'.repeat(32),
	deploymentEvidenceSha256: telegramPreviewDeploymentEvidenceSha256(deploymentEvidence),
	reviewedAt: '2026-08-13T08:00:00.000Z',
	reviewedBy: 'preview-operator',
};
const target = verifyTelegramPreviewTarget({ config, manifest });
const environment: TelegramProviderCheckEnvironment = {
	APP_ENV: 'preview',
	TELEGRAM_BOT_TOKEN: token,
	TELEGRAM_CHAT_ID: chatId,
	TELEGRAM_CHAT_TYPE: 'channel',
	TELEGRAM_TARGET_BINDING_KEY: bindingKey,
};
const argv = [
	'preflight',
	'--environment',
	'preview',
	'--config',
	'wrangler.preview.toml',
	'--target-manifest',
	'imports/telegram-preview-target.json',
	'--deployment-evidence',
	'imports/telegram-preview-deployment-evidence.json',
	'--confirm-preview-secrets',
	TELEGRAM_PREVIEW_CREDENTIALS_CONFIRMATION,
	'--confirm-read-only',
	TELEGRAM_PREFLIGHT_CONFIRMATION,
] as const;

function response(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'content-type': 'application/json' },
	});
}

function successfulPreflight() {
	return vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(response({ ok: true, result: { id: 123_456, is_bot: true } }))
		.mockResolvedValueOnce(
			response({
				ok: true,
				result: { id: Number(chatId), type: 'channel' },
			})
		)
		.mockResolvedValueOnce(
			response({
				ok: true,
				result: { status: 'administrator', can_post_messages: true },
			})
		)
		.mockResolvedValueOnce(response({ ok: true, result: { url: '' } }));
}

function expectCheckError(action: () => unknown, code: string): void {
	try {
		action();
		throw new Error('Expected Telegram provider check to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(TelegramProviderCheckError);
		expect((error as TelegramProviderCheckError).code).toBe(code);
	}
}

describe('Telegram provider read-only operator preflight', () => {
	it('creates deployment observation data from protected environment only', () => {
		expect(
			parseTelegramDeploymentEvidenceCreateArguments([
				'create',
				'--environment',
				'preview',
				'--confirmation',
				TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION,
			])
		).toEqual({ environment: 'preview' });
		expect(
			buildTelegramPreviewDeploymentEvidence({
				APP_ENV: 'preview',
				TELEGRAM_DEPLOYMENT_ACCOUNT_ID: deploymentEvidence.accountId,
				TELEGRAM_DEPLOYMENT_WORKER_NAME: deploymentEvidence.workerName,
				TELEGRAM_DEPLOYMENT_WORKER_VERSION_ID: deploymentEvidence.workerVersionId,
				TELEGRAM_DEPLOYMENT_GIT_SHA: deploymentEvidence.candidateGitCommitSha,
				TELEGRAM_DEPLOYMENT_OBSERVED_AT: deploymentEvidence.observedAt,
				TELEGRAM_DEPLOYMENT_OBSERVED_BY: deploymentEvidence.observedBy,
			})
		).toEqual(deploymentEvidence);
		expect(() =>
			parseTelegramDeploymentEvidenceCreateArguments([
				'create',
				'--environment',
				'preview',
				'--worker-version-id',
				deploymentEvidence.workerVersionId,
				'--confirmation',
				TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION,
			])
		).toThrowError(/Telegram deployment evidence creation failed/u);
	});

	it('builds a protected manifest draft from environment secrets without serializing them', () => {
		expect(
			parseTelegramPreviewTargetCreateArguments([
				'create',
				'--environment',
				'preview',
				'--config',
				'wrangler.preview.toml',
				'--deployment-evidence',
				'imports/telegram-preview-deployment-evidence.json',
				'--manifest',
				'imports/telegram-preview-target.json',
				'--confirmation',
				TELEGRAM_TARGET_CREATE_CONFIRMATION,
			])
		).toMatchObject({ configPath: 'wrangler.preview.toml' });
		expect(() =>
			parseTelegramPreviewTargetCreateArguments([
				'create',
				'--environment',
				'preview',
				'--reviewed-by',
				manifest.reviewedBy,
				'--confirmation',
				TELEGRAM_TARGET_CREATE_CONFIRMATION,
			])
		).toThrowError(/Telegram preview target manifest creation failed/u);
		const draft = buildTelegramPreviewTargetDraft({
			config,
			deploymentEvidence,
			reviewedAt: manifest.reviewedAt,
			reviewedBy: manifest.reviewedBy,
			...environment,
		});
		expect(JSON.parse(draft.manifestJson)).toEqual(manifest);
		expect(draft.targetFingerprint).toBe(target.fingerprintSha256);
		expect(draft.manifestJson).not.toContain(token);
		expect(draft.manifestJson).not.toContain(chatId);
		expect(draft.manifestJson).not.toContain(bindingKey);
	});

	it('accepts only exact preview paths and read-only confirmations', () => {
		expect(parseTelegramProviderCheckArguments(argv)).toEqual({
			command: 'preflight',
			environment: 'preview',
			configPath: 'wrangler.preview.toml',
			targetManifestPath: 'imports/telegram-preview-target.json',
			deploymentEvidencePath: 'imports/telegram-preview-deployment-evidence.json',
		});
		expectCheckError(
			() => parseTelegramProviderCheckArguments(['smoke']),
			'TELEGRAM_CHECK_COMMAND_INVALID'
		);
		expectCheckError(
			() =>
				parseTelegramProviderCheckArguments([
					...argv.slice(0, 2),
					'production',
					...argv.slice(3),
				]),
			'TELEGRAM_CHECK_ENVIRONMENT_INVALID'
		);
		expectCheckError(
			() => parseTelegramProviderCheckArguments([...argv, '--token', token]),
			'TELEGRAM_CHECK_ARGUMENT_UNKNOWN'
		);
	});

	it('runs only getMe/getChat/getChatMember/getWebhookInfo against a derived target', async () => {
		const fetchMock = successfulPreflight();
		const result = await runTelegramProviderCheck(
			parseTelegramProviderCheckArguments(argv),
			environment,
			{ fetch: fetchMock, target }
		);
		expect(result).toEqual({
			ok: true,
			botIdentityVerified: true,
			destinationVerified: true,
			postingPermissionVerified: true,
			webhookDisabled: true,
			chatType: 'channel',
			targetFingerprint: target.fingerprintSha256,
		});
		expect(fetchMock.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual([
			'getMe',
			'getChat',
			'getChatMember',
			'getWebhookInfo',
		]);
		expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/sendMessage'))).toBe(
			false
		);
		expect(JSON.stringify(result)).not.toContain(token);
		expect(JSON.stringify(result)).not.toContain(chatId);
	});

	it('binds preview config, D1, origin, provider and protected destination hash', async () => {
		expect(
			verifyTelegramPreviewDeploymentEvidence({
				target,
				evidence: deploymentEvidence,
				now: '2026-08-13T08:30:00.000Z',
			})
		).toEqual(deploymentEvidence);
		let futureReviewError: unknown;
		try {
			verifyTelegramPreviewDeploymentEvidence({
				target: verifyTelegramPreviewTarget({
					config,
					manifest: {
						...manifest,
						reviewedAt: '2026-08-13T09:00:00.000Z',
					},
				}),
				evidence: deploymentEvidence,
				now: '2026-08-13T08:30:00.000Z',
			});
		} catch (error) {
			futureReviewError = error;
		}
		expect(futureReviewError).toMatchObject({
			code: 'TELEGRAM_TARGET_DEPLOYMENT_REVIEW_IN_FUTURE',
		});
		expect(() =>
			verifyTelegramPreviewTarget({
				config: { ...config, vars: { ...config.vars, TELEGRAM_PROVIDER: 'disabled' } },
				manifest,
			})
		).toThrowError(TelegramPreviewTargetError);
		expect(() =>
			verifyTelegramPreviewTarget({
				config,
				manifest: {
					...manifest,
					binding: { ...binding, databaseId: '22222222-2222-4222-8222-222222222222' },
				},
			})
		).toThrowError(TelegramPreviewTargetError);

		for (const candidate of [
			{ ...environment, APP_ENV: 'production' },
			{ ...environment, TELEGRAM_CHAT_ID: '-1002222222222' },
			{ ...environment, TELEGRAM_CHAT_TYPE: 'group' },
			{ ...environment, TELEGRAM_BOT_TOKEN: `654321:${'B'.repeat(30)}` },
			{ ...environment, TELEGRAM_TARGET_BINDING_KEY: 'wrong-key-'.padEnd(48, 'X') },
		]) {
			const fetchMock = vi.fn<typeof globalThis.fetch>();
			await expect(
				runTelegramProviderCheck(parseTelegramProviderCheckArguments(argv), candidate, {
					fetch: fetchMock,
					target,
				})
			).rejects.toBeInstanceOf(TelegramPreviewTargetError);
			expect(fetchMock).not.toHaveBeenCalled();
		}
	});

	it('keeps rejected input and provider diagnostics out of safe failures', async () => {
		const secret = `${token}.${chatId}.raw-body`;
		let error: unknown;
		try {
			await runTelegramProviderCheck(
				parseTelegramProviderCheckArguments(argv),
				{ ...environment, TELEGRAM_BOT_TOKEN: secret },
				{ fetch: vi.fn<typeof globalThis.fetch>(), target }
			);
		} catch (cause) {
			error = cause;
		}
		expect(telegramProviderCheckFailure(error)).toEqual({
			ok: false,
			errorCode: 'TELEGRAM_TARGET_BOT_TOKEN_INVALID',
		});
		expect(JSON.stringify(error)).not.toContain(secret);
	});
});
