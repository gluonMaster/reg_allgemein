import { describe, expect, it } from 'vitest';
import { validateUpload } from '$lib/server/documents/validation';
import type { DocumentRuntimeConfig } from '$lib/server/config/runtime';

const config: DocumentRuntimeConfig = {
	uploadEnabled: true,
	maxFileBytes: 1024,
	maxFilesPerAuthorization: 5,
	maxAuthorizationBytes: 25 * 1024 * 1024,
	uploadRateLimitWindowSeconds: 60,
	uploadRateLimitMaxAttempts: 5,
	avAttestationTextVersion: 'manual-local-av-v1',
};

function file(name: string, type: string, bytes: number[]) {
	const body = Uint8Array.from(bytes);
	return { name, type, size: body.length, arrayBuffer: async () => body.buffer };
}

const pdf = [...new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')];
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9];
const png = [
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x00, 0x49, 0x44, 0x41, 0x54,
	0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
	0xae, 0x42, 0x60, 0x82,
];

describe('private funding document validation', () => {
	it('accepts only matching extension, MIME, and signature', async () => {
		await expect(validateUpload(file('proof.pdf', 'application/pdf', pdf), config))
			.resolves.toMatchObject({ detectedType: 'pdf', extension: 'pdf' });
		await expect(validateUpload(file('proof.jpg', 'image/jpeg', jpeg), config))
			.resolves.toMatchObject({ detectedType: 'jpeg' });
		await expect(validateUpload(file('proof.png', 'image/png', png), config))
			.resolves.toMatchObject({ detectedType: 'png' });
	});

	it('rejects spoofed MIME, extension, and body signatures', async () => {
		await expect(validateUpload(file('proof.jpg', 'image/jpeg', pdf), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_TYPE_CONFLICT' });
		await expect(validateUpload(file('proof.pdf', 'image/jpeg', pdf), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_TYPE_CONFLICT' });
		await expect(validateUpload(file('proof.docx', 'application/pdf', pdf), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_EXTENSION_REJECTED' });
		await expect(validateUpload(file('proof.pdf', 'application/pdf', [1, 2, 3]), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_SIGNATURE_REJECTED' });
	});

	it('rejects encrypted PDFs, ZIP polyglots, and declared or actual oversize bodies', async () => {
		const encrypted = [...new TextEncoder().encode('%PDF-1.7\n/Encrypt true\n%%EOF')];
		const polyglot = [...pdf.slice(0, 10), 0x50, 0x4b, 0x03, 0x04, ...pdf.slice(10)];
		await expect(validateUpload(file('proof.pdf', 'application/pdf', encrypted), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_PDF_ENCRYPTED' });
		await expect(validateUpload(file('proof.pdf', 'application/pdf', polyglot), config))
			.rejects.toMatchObject({ code: 'DOCUMENT_POLYGLOT_REJECTED' });
		await expect(validateUpload({ ...file('proof.pdf', 'application/pdf', pdf), size: 2048 }, config))
			.rejects.toMatchObject({ code: 'DOCUMENT_SIZE_REJECTED' });
	});
});
