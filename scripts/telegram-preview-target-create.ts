import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unstable_readConfig } from 'wrangler';
import {
	assertProtectedTelegramArtifactPath,
	buildTelegramPreviewTargetDraft,
	hardenProtectedTelegramArtifactPath,
	TelegramPreviewTargetError,
	type TelegramPreviewSecretEnvironment,
} from './telegram-preview-target';

export const TELEGRAM_TARGET_CREATE_CONFIRMATION = 'WRITE_PROTECTED_TARGET_MANIFEST';

interface TargetCreateArguments {
	configPath: string;
	deploymentEvidencePath: string;
	manifestPath: string;
}

interface TelegramPreviewTargetCreateEnvironment extends TelegramPreviewSecretEnvironment {
	TELEGRAM_TARGET_REVIEWED_AT?: string;
	TELEGRAM_TARGET_REVIEWED_BY?: string;
}

export class TelegramPreviewTargetCreateError extends Error {
	constructor(readonly code: string) {
		super('Telegram preview target manifest creation failed.');
		this.name = 'TelegramPreviewTargetCreateError';
	}
}

function fail(code: string): never {
	throw new TelegramPreviewTargetCreateError(code);
}

function required(options: ReadonlyMap<string, string>, key: string): string {
	const value = options.get(key);
	if (!value) fail(`TELEGRAM_TARGET_CREATE_${key.replaceAll('-', '_').toUpperCase()}_REQUIRED`);
	return value;
}

export function parseTelegramPreviewTargetCreateArguments(
	argv: readonly string[]
): TargetCreateArguments {
	if (argv[0] !== 'create') fail('TELEGRAM_TARGET_CREATE_COMMAND_INVALID');
	const allowed = new Set([
		'environment',
		'config',
		'deployment-evidence',
		'manifest',
		'confirmation',
	]);
	const options = new Map<string, string>();
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith('--')) fail('TELEGRAM_TARGET_CREATE_ARGUMENT_INVALID');
		const key = token.slice(2);
		if (!allowed.has(key)) fail('TELEGRAM_TARGET_CREATE_ARGUMENT_UNKNOWN');
		if (options.has(key)) fail('TELEGRAM_TARGET_CREATE_ARGUMENT_DUPLICATE');
		const value = argv[index + 1];
		if (!value || value.startsWith('--'))
			fail('TELEGRAM_TARGET_CREATE_ARGUMENT_VALUE_REQUIRED');
		options.set(key, value);
		index += 1;
	}
	if (options.get('environment') !== 'preview')
		fail('TELEGRAM_TARGET_CREATE_ENVIRONMENT_INVALID');
	if (options.get('confirmation') !== TELEGRAM_TARGET_CREATE_CONFIRMATION) {
		fail('TELEGRAM_TARGET_CREATE_CONFIRMATION_INVALID');
	}
	return {
		configPath: required(options, 'config'),
		deploymentEvidencePath: required(options, 'deployment-evidence'),
		manifestPath: required(options, 'manifest'),
	};
}

async function main(): Promise<void> {
	const arguments_ = parseTelegramPreviewTargetCreateArguments(process.argv.slice(2));
	if (resolve(arguments_.configPath) !== resolve(process.cwd(), 'wrangler.preview.toml')) {
		fail('TELEGRAM_TARGET_CREATE_CONFIG_PATH_INVALID');
	}
	await mkdir(dirname(resolve(arguments_.manifestPath)), { recursive: true, mode: 0o700 });
	const deploymentEvidencePath = await assertProtectedTelegramArtifactPath(
		arguments_.deploymentEvidencePath,
		'telegram-preview-deployment-evidence.json'
	);
	const deploymentEvidence = JSON.parse(
		await readFile(deploymentEvidencePath, 'utf8')
	) as unknown;
	const config = unstable_readConfig({ config: arguments_.configPath }, { hideWarnings: true });
	const environment = process.env as TelegramPreviewTargetCreateEnvironment;
	const draft = buildTelegramPreviewTargetDraft({
		config,
		deploymentEvidence,
		reviewedAt: environment.TELEGRAM_TARGET_REVIEWED_AT ?? '',
		reviewedBy: environment.TELEGRAM_TARGET_REVIEWED_BY ?? '',
		...environment,
	});
	const manifestPath = resolve(arguments_.manifestPath);
	if (manifestPath !== resolve(process.cwd(), 'imports', 'telegram-preview-target.json')) {
		fail('TELEGRAM_TARGET_CREATE_MANIFEST_PATH_INVALID');
	}
	await writeFile(manifestPath, draft.manifestJson, {
		encoding: 'utf8',
		flag: 'wx',
		mode: 0o600,
	});
	await hardenProtectedTelegramArtifactPath(manifestPath, 'telegram-preview-target.json');
	process.stdout.write(
		`${JSON.stringify(
			{
				ok: true,
				targetFingerprint: draft.targetFingerprint,
				manifestCreated: true,
			},
			null,
			2
		)}\n`
	);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		const code =
			error instanceof TelegramPreviewTargetCreateError ||
			error instanceof TelegramPreviewTargetError
				? error.code
				: 'TELEGRAM_TARGET_CREATE_FAILED';
		process.stdout.write(`${JSON.stringify({ ok: false, errorCode: code }, null, 2)}\n`);
		process.exitCode = 1;
	});
}
