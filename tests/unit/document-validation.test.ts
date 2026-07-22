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
// One-page PDF 1.7 whose object stream is also a valid ZIP with an empty `a`
// entry. The ZIP EOCD treats the final PDF xref/trailer as its comment, so both
// `pdfinfo` and Python `zipfile` accept the same 498-byte body.
const pdfZipDualParser = [
	...atob(
		'JVBERi0xLjcKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAxMCAxMF0gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMDAgPj4Kc3RyZWFtClBLAwQUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAGFQSwECFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAADZAAAAYVBLBQYAAAAAAQABAC8AAAD4AAAAtQAKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAxODQgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA1IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgozMzUKJSVFT0YK'
	),
].map((character) => character.charCodeAt(0));
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9];
const png = [
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x49, 0x44, 0x41, 0x54, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

describe('private funding document validation', () => {
	it('accepts only matching extension, MIME, and signature', async () => {
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', pdf), config)
		).resolves.toMatchObject({ detectedType: 'pdf', extension: 'pdf' });
		await expect(
			validateUpload(file('proof.jpg', 'image/jpeg', jpeg), config)
		).resolves.toMatchObject({ detectedType: 'jpeg' });
		await expect(
			validateUpload(file('proof.png', 'image/png', png), config)
		).resolves.toMatchObject({ detectedType: 'png' });
	});

	it('rejects spoofed MIME, extension, and body signatures', async () => {
		await expect(
			validateUpload(file('proof.jpg', 'image/jpeg', pdf), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_CONFLICT' });
		await expect(
			validateUpload(file('proof.pdf', 'image/jpeg', pdf), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_CONFLICT' });
		await expect(
			validateUpload(file('proof.docx', 'application/pdf', pdf), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_EXTENSION_REJECTED' });
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', [1, 2, 3]), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_SIGNATURE_REJECTED' });
	});

	it('rejects encrypted PDFs, ZIP polyglots, and declared or actual oversize bodies', async () => {
		const encrypted = [...new TextEncoder().encode('%PDF-1.7\n/Encrypt true\n%%EOF')];
		const escapedEncrypted = [
			...new TextEncoder().encode('%PDF-1.7\ntrailer << /Encr#79pt 1 0 R >>\n%%EOF'),
		];
		const escapedEncryptedPrefix = [
			...new TextEncoder().encode('%PDF-1.7\ntrailer << /#45ncrypt 1 0 R >>\n%%EOF'),
		];
		const polyglot = [...pdf, 0x50, 0x4b, 0x03, 0x04];
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', encrypted), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_PDF_ENCRYPTED' });
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', escapedEncrypted), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_PDF_ENCRYPTED' });
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', escapedEncryptedPrefix), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_PDF_ENCRYPTED' });
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', polyglot), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_POLYGLOT_REJECTED' });
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', pdfZipDualParser), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_POLYGLOT_REJECTED' });
		await expect(
			validateUpload(
				file('proof.jpg', 'image/jpeg', [...jpeg, 0x50, 0x4b, 0x03, 0x04]),
				config
			)
		).rejects.toMatchObject({ code: 'DOCUMENT_POLYGLOT_REJECTED' });
		await expect(
			validateUpload(file('proof.png', 'image/png', [...png, 0x50, 0x4b, 0x05, 0x06]), config)
		).rejects.toMatchObject({ code: 'DOCUMENT_POLYGLOT_REJECTED' });
		const encryptedPrefix = new TextEncoder().encode('%PDF-1.7\n/Encrypt 9 0 R\n');
		const padding = new Uint8Array(70_000).fill(0x20);
		const incremental = [
			...encryptedPrefix,
			...padding,
			...new TextEncoder().encode('\n1 0 obj\n<< /Prev 10 >>\nendobj\n%%EOF'),
		];
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', incremental), {
				...config,
				maxFileBytes: 100_000,
			})
		).rejects.toMatchObject({ code: 'DOCUMENT_PDF_ENCRYPTED' });
		await expect(
			validateUpload({ ...file('proof.pdf', 'application/pdf', pdf), size: 2048 }, config)
		).rejects.toMatchObject({ code: 'DOCUMENT_SIZE_REJECTED' });
	});

	it('does not mistake benign compressed-content bytes for an executable header', async () => {
		const benign = [
			...new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Length 8 >>\nstream\n'),
			0x01,
			0x4d,
			0x5a,
			0x02,
			0x7f,
			0x45,
			0x4c,
			0x46,
			...new TextEncoder().encode('\nendstream\nendobj\n%%EOF'),
		];
		await expect(
			validateUpload(file('proof.pdf', 'application/pdf', benign), config)
		).resolves.toMatchObject({ detectedType: 'pdf' });
	});
});
