import { z } from 'zod';

export const quarantineDownloadPurposeSchema = z.enum(['local_av_scan']);

export const contractArtifactDownloadPurposeSchema = z.enum([
	'contract_administration',
	'legal_evidence_review',
]);

export type QuarantineDownloadPurpose = z.infer<typeof quarantineDownloadPurposeSchema>;
export type ContractArtifactDownloadPurpose = z.infer<typeof contractArtifactDownloadPurposeSchema>;
