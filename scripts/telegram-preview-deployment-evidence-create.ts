import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	buildTelegramPreviewDeploymentEvidence,
	hardenProtectedTelegramArtifactPath,
	TelegramPreviewTargetError,
	type TelegramPreviewDeploymentEvidenceInput,
} from './telegram-preview-target';

export const TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION = 'WRITE_PROTECTED_DEPLOYMENT_EVIDENCE';

interface Arguments {
	environment: 'preview';
}

export class TelegramDeploymentEvidenceCreateError extends Error {
	constructor(readonly code: string) {
		super('Telegram deployment evidence creation failed.');
		this.name = 'TelegramDeploymentEvidenceCreateError';
	}
}

function fail(code: string): never {
	throw new TelegramDeploymentEvidenceCreateError(code);
}

export function parseTelegramDeploymentEvidenceCreateArguments(argv: readonly string[]): Arguments {
	if (argv[0] !== 'create') fail('TELEGRAM_DEPLOYMENT_EVIDENCE_COMMAND_INVALID');
	const allowed = new Set(['environment', 'confirmation']);
	const options = new Map<string, string>();
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token?.startsWith('--')) fail('TELEGRAM_DEPLOYMENT_EVIDENCE_ARGUMENT_INVALID');
		const key = token.slice(2);
		if (!allowed.has(key)) fail('TELEGRAM_DEPLOYMENT_EVIDENCE_ARGUMENT_UNKNOWN');
		if (options.has(key)) fail('TELEGRAM_DEPLOYMENT_EVIDENCE_ARGUMENT_DUPLICATE');
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) {
			fail('TELEGRAM_DEPLOYMENT_EVIDENCE_ARGUMENT_VALUE_REQUIRED');
		}
		options.set(key, value);
		index += 1;
	}
	if (options.get('environment') !== 'preview') {
		fail('TELEGRAM_DEPLOYMENT_EVIDENCE_ENVIRONMENT_INVALID');
	}
	if (options.get('confirmation') !== TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION) {
		fail('TELEGRAM_DEPLOYMENT_EVIDENCE_CONFIRMATION_INVALID');
	}
	return { environment: 'preview' };
}

async function main(): Promise<void> {
	parseTelegramDeploymentEvidenceCreateArguments(process.argv.slice(2));
	const evidence = buildTelegramPreviewDeploymentEvidence(
		process.env as TelegramPreviewDeploymentEvidenceInput
	);
	const outputPath = resolve(
		process.cwd(),
		'imports',
		'telegram-preview-deployment-evidence.json'
	);
	await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
	await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
		encoding: 'utf8',
		flag: 'wx',
		mode: 0o600,
	});
	await hardenProtectedTelegramArtifactPath(
		outputPath,
		'telegram-preview-deployment-evidence.json'
	);
	process.stdout.write(
		`${JSON.stringify({ ok: true, deploymentEvidenceCreated: true }, null, 2)}\n`
	);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
	main().catch((error: unknown) => {
		const errorCode =
			error instanceof TelegramDeploymentEvidenceCreateError ||
			error instanceof TelegramPreviewTargetError
				? error.code
				: 'TELEGRAM_DEPLOYMENT_EVIDENCE_CREATE_FAILED';
		process.stdout.write(`${JSON.stringify({ ok: false, errorCode }, null, 2)}\n`);
		process.exitCode = 1;
	});
}
