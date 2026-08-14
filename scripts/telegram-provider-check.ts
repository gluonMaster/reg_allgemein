import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TelegramProviderError } from '../src/lib/server/outbox/providers';
import {
	isTelegramBotToken,
	TelegramBotApiProvider,
	type TelegramBotApiProviderOptions,
	type TelegramBureauChatType,
} from '../src/lib/server/telegram/bot-api';
import {
	assertTelegramPreviewSecretBinding,
	loadTelegramPreviewTarget,
	TelegramPreviewTargetError,
	type TelegramPreviewSecretEnvironment,
	type VerifiedTelegramPreviewTarget,
} from './telegram-preview-target';

export const TELEGRAM_PREVIEW_CREDENTIALS_CONFIRMATION = 'PREVIEW_SECRETS_ONLY';
export const TELEGRAM_PREFLIGHT_CONFIRMATION = 'PREFLIGHT_READ_ONLY';

export type TelegramProviderCheckCommand = 'preflight';

export interface TelegramProviderCheckArguments {
	command: TelegramProviderCheckCommand;
	environment: 'preview';
	configPath: string;
	targetManifestPath: string;
	deploymentEvidencePath: string;
}

export interface TelegramProviderCheckEnvironment extends TelegramPreviewSecretEnvironment {}

export interface TelegramProviderCheckDependencies {
	fetch?: typeof globalThis.fetch;
	target?: VerifiedTelegramPreviewTarget;
}

export interface TelegramProviderCheckResult {
	ok: true;
	botIdentityVerified: true;
	destinationVerified: true;
	postingPermissionVerified: true;
	webhookDisabled: true;
	chatType: TelegramBureauChatType;
	targetFingerprint: string;
}

export class TelegramProviderCheckError extends Error {
	constructor(readonly code: string) {
		super('Telegram provider check failed.');
		this.name = 'TelegramProviderCheckError';
	}
}

function fail(code: string): never {
	throw new TelegramProviderCheckError(code);
}

function exactOption(options: Map<string, string>, key: string, expected: string): void {
	const value = options.get(key);
	if (value === undefined)
		fail(`TELEGRAM_CHECK_${key.replaceAll('-', '_').toUpperCase()}_REQUIRED`);
	if (value !== expected)
		fail(`TELEGRAM_CHECK_${key.replaceAll('-', '_').toUpperCase()}_INVALID`);
}

export function parseTelegramProviderCheckArguments(
	argv: readonly string[]
): TelegramProviderCheckArguments {
	const command = argv[0];
	if (command !== 'preflight') {
		fail('TELEGRAM_CHECK_COMMAND_INVALID');
	}

	const allowed = new Set([
		'environment',
		'config',
		'target-manifest',
		'deployment-evidence',
		'confirm-preview-secrets',
		'confirm-read-only',
	]);
	const options = new Map<string, string>();
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!/^--[a-z][a-z-]*$/u.test(token)) fail('TELEGRAM_CHECK_ARGUMENT_UNKNOWN');
		const key = token.slice(2);
		if (!allowed.has(key)) fail('TELEGRAM_CHECK_ARGUMENT_UNKNOWN');
		if (options.has(key)) fail('TELEGRAM_CHECK_ARGUMENT_DUPLICATE');
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) fail('TELEGRAM_CHECK_ARGUMENT_VALUE_REQUIRED');
		options.set(key, value);
		index += 1;
	}

	exactOption(options, 'environment', 'preview');
	exactOption(options, 'confirm-preview-secrets', TELEGRAM_PREVIEW_CREDENTIALS_CONFIRMATION);
	exactOption(options, 'confirm-read-only', TELEGRAM_PREFLIGHT_CONFIRMATION);
	const configPath = options.get('config');
	if (!configPath) fail('TELEGRAM_CHECK_CONFIG_REQUIRED');
	const targetManifestPath = options.get('target-manifest');
	if (!targetManifestPath) fail('TELEGRAM_CHECK_TARGET_MANIFEST_REQUIRED');
	const deploymentEvidencePath = options.get('deployment-evidence');
	if (!deploymentEvidencePath) fail('TELEGRAM_CHECK_DEPLOYMENT_EVIDENCE_REQUIRED');
	return {
		command,
		environment: 'preview',
		configPath,
		targetManifestPath,
		deploymentEvidencePath,
	};
}

function providerOptions(
	target: VerifiedTelegramPreviewTarget,
	environment: TelegramProviderCheckEnvironment,
	fetchImplementation?: typeof globalThis.fetch
): TelegramBotApiProviderOptions {
	const { token, chatId, chatType } = assertTelegramPreviewSecretBinding(target, environment);
	if (!isTelegramBotToken(token)) fail('TELEGRAM_CHECK_BOT_TOKEN_INVALID');
	return {
		token,
		chatId,
		chatType,
		timeoutMs: target.manifest.binding.telegramBotApiTimeoutMs,
		...(fetchImplementation ? { fetch: fetchImplementation } : {}),
	};
}

export async function runTelegramProviderCheck(
	arguments_: TelegramProviderCheckArguments,
	environment: TelegramProviderCheckEnvironment,
	dependencies: TelegramProviderCheckDependencies = {}
): Promise<TelegramProviderCheckResult> {
	if (arguments_.command !== 'preflight') {
		fail('TELEGRAM_CHECK_COMMAND_INVALID');
	}
	if (arguments_.environment !== 'preview') fail('TELEGRAM_CHECK_ENVIRONMENT_INVALID');
	const target =
		dependencies.target ??
		(await loadTelegramPreviewTarget(
			arguments_.configPath,
			arguments_.targetManifestPath,
			arguments_.deploymentEvidencePath
		));
	const options = providerOptions(target, environment, dependencies.fetch);
	const provider = new TelegramBotApiProvider(options);
	return {
		ok: true,
		...(await provider.preflight()),
		targetFingerprint: target.fingerprintSha256,
	};
}

export function telegramProviderCheckFailure(error: unknown): {
	ok: false;
	errorCode: string;
} {
	const candidate =
		error instanceof TelegramProviderCheckError ||
		error instanceof TelegramProviderError ||
		error instanceof TelegramPreviewTargetError
			? error.code
			: '';
	return {
		ok: false,
		errorCode: /^[A-Z0-9_]{1,100}$/u.test(candidate)
			? candidate
			: 'TELEGRAM_PROVIDER_CHECK_FAILED',
	};
}

function printSafe(
	value: TelegramProviderCheckResult | ReturnType<typeof telegramProviderCheckFailure>
) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
	const arguments_ = parseTelegramProviderCheckArguments(process.argv.slice(2));
	printSafe(await runTelegramProviderCheck(arguments_, process.env));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		printSafe(telegramProviderCheckFailure(error));
		process.exitCode = 1;
	});
}
