import { ContractEmailAttachmentResolver } from '$lib/server/outbox/email-attachments';
import { sha256Bytes } from '$lib/server/security/digest';
import type { EmailOutboxRow } from '$lib/server/outbox/contracts';
import type { EmailOutboxStore } from '$lib/server/outbox/contracts';
import type { SqlDatabaseBoundary } from '$lib/server/db/database';
import type { ContractArtifactStore } from '$lib/server/contracts/storage';
import { FakeEmailProvider } from '$lib/server/outbox/providers';
import { EmailOutboxWorker } from '$lib/server/outbox/outbox-worker';

function row(template = 'contract.sent'): EmailOutboxRow {
	return {
		id: 'email-contract-1',
		source_kind: 'contract_offer',
		source_id: 'offer-1',
		template_or_category: template,
		recipient_address_kind: 'current',
		locale: 'de',
		payload_json: '{}',
		dedupe_key: 'email:contract:offer-1',
		attempts: 0,
		max_attempts: 5,
		email: 'preview@example.test',
		token_id: null,
		token_kind: null,
		user_id: 'parent-1',
		lease_owner: 'worker-1',
	};
}

describe('contract email attachments', () => {
	it('loads the immutable preview PDF, verifies D1/R2 integrity, and marks the attachment', async () => {
		const bytes = new TextEncoder().encode('%PDF-1.7 synthetic preview');
		const sha256 = await sha256Bytes(bytes);
		const db = {
			first: async (query: { params?: unknown[] }) => {
				expect(query.params).toEqual(['offer-1', 'parent-1']);
				return {
					private_r2_key: 'contract-artifacts/offers/offer-1.pdf',
					sha256,
					size_bytes: bytes.byteLength,
					contract_number: '2. 0001/1',
					usage_scope: 'preview_review',
				};
			},
		} as unknown as SqlDatabaseBoundary;
		const store = {
			get: async () => ({ body: bytes.buffer, size: bytes.byteLength }),
		} as unknown as ContractArtifactStore;
		const resolved = await new ContractEmailAttachmentResolver(db, store, 10_000).resolve(
			row()
		);
		expect(resolved.previewReview).toBe(true);
		expect(resolved.attachments).toHaveLength(1);
		expect(resolved.attachments[0]).toMatchObject({
			filename: 'TEST-ENTWURF-Vertrag-2-0001-1.pdf',
			contentType: 'application/pdf',
		});
		expect(resolved.attachments[0].content).toEqual(bytes);
	});

	it('fails closed on an R2 hash mismatch and ignores unrelated email templates', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const db = {
			first: async () => ({
				private_r2_key: 'offer.pdf',
				sha256: 'a'.repeat(64),
				size_bytes: bytes.byteLength,
				contract_number: 'K-1',
				usage_scope: 'preview_review',
			}),
		} as unknown as SqlDatabaseBoundary;
		const store = {
			get: async () => ({ body: bytes.buffer, size: bytes.byteLength }),
		} as unknown as ContractArtifactStore;
		const resolver = new ContractEmailAttachmentResolver(db, store, 10_000);
		await expect(resolver.resolve(row())).rejects.toMatchObject({
			code: 'CONTRACT_EMAIL_ATTACHMENT_HASH_MISMATCH',
		});
		await expect(resolver.resolve(row('auth.welcome'))).resolves.toEqual({
			attachments: [],
			previewReview: false,
		});
	});

	it('marks the normal outbox message and sends the verified preview PDF through the provider', async () => {
		const claimed = {
			...row(),
			payload_json: JSON.stringify({
				portalPath: '/contracts/offer-1',
				contractNumber: 'K-1',
			}),
		};
		let available = true;
		const repository: EmailOutboxStore = {
			cancelInvalidEmailRows: async () => 0,
			claimEmail: async () => {
				if (!available) return null;
				available = false;
				return claimed;
			},
			markEmailSent: async () => true,
			markEmailFailed: async () => 'dead',
		};
		const provider = new FakeEmailProvider();
		const attachment = {
			filename: 'TEST-ENTWURF-Vertrag-K-1.pdf',
			content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
			contentType: 'application/pdf' as const,
		};
		const worker = new EmailOutboxWorker(
			repository,
			provider,
			undefined,
			{ portalPublicOrigin: 'https://portal-preview.example.org' },
			{ leaseSeconds: 60, retryBaseSeconds: 60, retryMaxSeconds: 3_600 },
			'preview-contract-email-worker',
			() => '2026-08-26T10:00:00.000Z',
			{ resolve: async () => ({ attachments: [attachment], previewReview: true }) }
		);
		await expect(worker.dispatchNext()).resolves.toBe('sent');
		expect(provider.messages).toHaveLength(1);
		expect(provider.messages[0].subject).toContain('[TEST/ENTWURF]');
		expect(provider.messages[0].text).toContain('nicht für reale Vertragsbeziehungen');
		expect(provider.messages[0].attachments).toEqual([attachment]);
	});
});
