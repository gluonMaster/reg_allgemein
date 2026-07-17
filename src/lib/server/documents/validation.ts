import { sha256Bytes } from '$lib/server/security/digest';
import type { DocumentRuntimeConfig } from '$lib/server/config/runtime';

export type DetectedDocumentType = 'pdf' | 'jpeg' | 'png';

export class DocumentValidationError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'DocumentValidationError';
	}
}

export interface UploadFileLike {
	name: string;
	type: string;
	size: number;
	arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValidatedUpload {
	body: Uint8Array;
	extension: 'pdf' | 'jpg' | 'jpeg' | 'png';
	mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
	detectedType: DetectedDocumentType;
	sizeBytes: number;
	sha256: string;
}

const ascii = new TextDecoder('latin1');

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
	return prefix.every((byte, index) => bytes[index] === byte);
}

function containsSequence(bytes: Uint8Array, sequence: readonly number[]): boolean {
	outer: for (let index = 0; index <= bytes.length - sequence.length; index += 1) {
		for (let offset = 0; offset < sequence.length; offset += 1) {
			if (bytes[index + offset] !== sequence[offset]) continue outer;
		}
		return true;
	}
	return false;
}

function detectPdf(bytes: Uint8Array): boolean {
	if (!hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return false;
	const tail = bytes.slice(Math.max(0, bytes.length - 65_536));
	const tailText = ascii.decode(tail);
	if (!tailText.includes('%%EOF')) throw new DocumentValidationError('DOCUMENT_PDF_MALFORMED');
	if (tailText.includes('/Encrypt')) throw new DocumentValidationError('DOCUMENT_PDF_ENCRYPTED');
	if (containsSequence(bytes, [0x50, 0x4b, 0x03, 0x04])) {
		throw new DocumentValidationError('DOCUMENT_POLYGLOT_REJECTED');
	}
	return true;
}

function detectJpeg(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 4 &&
		hasPrefix(bytes, [0xff, 0xd8, 0xff]) &&
		bytes[bytes.length - 2] === 0xff &&
		bytes[bytes.length - 1] === 0xd9
	);
}

function detectPng(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 20 &&
		hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
		ascii.decode(bytes.slice(bytes.length - 8, bytes.length - 4)) === 'IEND'
	);
}

function extensionOf(name: string): 'pdf' | 'jpg' | 'jpeg' | 'png' {
	const match = /\.([a-z0-9]+)$/iu.exec(name.trim());
	const extension = match?.[1]?.toLocaleLowerCase('en-US');
	if (!extension || !['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) {
		throw new DocumentValidationError('DOCUMENT_EXTENSION_REJECTED');
	}
	return extension as 'pdf' | 'jpg' | 'jpeg' | 'png';
}

export async function validateUpload(
	file: UploadFileLike,
	config: DocumentRuntimeConfig
): Promise<ValidatedUpload> {
	if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > config.maxFileBytes) {
		throw new DocumentValidationError('DOCUMENT_SIZE_REJECTED');
	}
	const extension = extensionOf(file.name);
	const body = new Uint8Array(await file.arrayBuffer());
	if (body.byteLength !== file.size || body.byteLength > config.maxFileBytes) {
		throw new DocumentValidationError('DOCUMENT_SIZE_REJECTED');
	}

	const detectedType: DetectedDocumentType = detectPdf(body)
		? 'pdf'
		: detectJpeg(body)
			? 'jpeg'
			: detectPng(body)
				? 'png'
				: (() => {
						throw new DocumentValidationError('DOCUMENT_SIGNATURE_REJECTED');
					})();
	const expected =
		detectedType === 'pdf'
			? { extensions: ['pdf'], mime: 'application/pdf' as const }
			: detectedType === 'jpeg'
				? { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg' as const }
				: { extensions: ['png'], mime: 'image/png' as const };
	if (!expected.extensions.includes(extension) || file.type !== expected.mime) {
		throw new DocumentValidationError('DOCUMENT_TYPE_CONFLICT');
	}

	return {
		body,
		extension,
		mimeType: expected.mime,
		detectedType,
		sizeBytes: body.byteLength,
		sha256: await sha256Bytes(body),
	};
}
