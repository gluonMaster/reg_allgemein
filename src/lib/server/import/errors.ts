import type { ImportIssueDraft } from './types';

export class ImportContractError extends Error {
	readonly issue: ImportIssueDraft;
	readonly structuralFingerprintSha256: string;

	constructor(input: {
		code: string;
		structuralFingerprintSha256: string;
		safeContext?: Record<string, unknown>;
		cause?: unknown;
	}) {
		super('Import source contract validation failed.', { cause: input.cause });
		this.name = 'ImportContractError';
		this.structuralFingerprintSha256 = input.structuralFingerprintSha256;
		this.issue = {
			severity: 'fatal',
			code: input.code,
			safeContext: input.safeContext,
			blocksPromotion: true,
		};
	}
}
