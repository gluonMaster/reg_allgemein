import type { SqlDatabaseBoundary } from '$lib/server/db/database';
import { sha256Bytes } from '$lib/server/security/digest';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import type { EmailOutboxRow } from './contracts';
import type { EmailAttachment } from './providers';
import { OutboxTemplateError } from './templates';

interface StoredOfferPdfAttachment {
	private_r2_key: string;
	sha256: string;
	size_bytes: number;
	contract_number: string;
	usage_scope: 'synthetic_test' | 'preview_review' | 'production';
}

export interface EmailAttachmentResolution {
	attachments: readonly EmailAttachment[];
	previewReview: boolean;
}

export interface EmailAttachmentResolver {
	resolve(row: EmailOutboxRow): Promise<EmailAttachmentResolution>;
}

function attachmentFilename(contractNumber: string, previewReview: boolean): string {
	const safe =
		contractNumber
			.normalize('NFKD')
			.replace(/[^A-Za-z0-9_-]+/gu, '-')
			.replace(/^-+|-+$/gu, '')
			.slice(0, 80) || 'Vertrag';
	return `${previewReview ? 'TEST-ENTWURF-' : ''}Vertrag-${safe}.pdf`;
}

export class ContractEmailAttachmentResolver implements EmailAttachmentResolver {
	constructor(
		private readonly db: SqlDatabaseBoundary,
		private readonly store: ContractArtifactStore,
		private readonly maxPdfBytes: number
	) {}

	async resolve(row: EmailOutboxRow): Promise<EmailAttachmentResolution> {
		if (row.template_or_category !== 'contract.sent') {
			return { attachments: [], previewReview: false };
		}
		if (row.source_kind !== 'contract_offer' || row.source_id.length === 0) {
			throw new OutboxTemplateError('CONTRACT_EMAIL_SOURCE_INVALID');
		}
		const artifact = await this.db.first<StoredOfferPdfAttachment>({
			sql: `SELECT artifact.private_r2_key, artifact.sha256, artifact.size_bytes,
				offer.contract_number, template.usage_scope
			FROM contract_artifacts artifact
			JOIN contract_offers offer ON offer.id = artifact.contract_offer_id
			JOIN contract_template_versions template ON template.id = offer.template_version_id
			WHERE offer.id = ? AND offer.status IN ('sent', 'accepted_by_parent', 'approved_by_admin')
				AND offer.user_id = ?
				AND offer.render_status = 'ready' AND offer.contract_pdf_r2_key = artifact.private_r2_key
				AND artifact.artifact_kind = 'offer_pdf' AND artifact.content_type = 'application/pdf'`,
			params: [row.source_id, row.user_id],
		});
		if (
			!artifact ||
			!Number.isSafeInteger(artifact.size_bytes) ||
			artifact.size_bytes < 1 ||
			artifact.size_bytes > this.maxPdfBytes
		) {
			throw new OutboxTemplateError('CONTRACT_EMAIL_ATTACHMENT_INVALID');
		}
		let stored;
		try {
			stored = await this.store.get(artifact.private_r2_key, {
				maximumSizeBytes: this.maxPdfBytes,
				expectedSizeBytes: artifact.size_bytes,
			});
		} catch {
			throw new OutboxTemplateError('CONTRACT_EMAIL_ATTACHMENT_INVALID');
		}
		if (!stored || stored.size !== artifact.size_bytes) {
			throw new OutboxTemplateError('CONTRACT_EMAIL_ATTACHMENT_MISSING');
		}
		const content = new Uint8Array(stored.body);
		if (
			content.byteLength !== artifact.size_bytes ||
			(await sha256Bytes(content)) !== artifact.sha256
		) {
			throw new OutboxTemplateError('CONTRACT_EMAIL_ATTACHMENT_HASH_MISMATCH');
		}
		const previewReview = artifact.usage_scope === 'preview_review';
		return {
			previewReview,
			attachments: [
				{
					filename: attachmentFilename(artifact.contract_number, previewReview),
					content,
					contentType: 'application/pdf',
				},
			],
		};
	}
}
