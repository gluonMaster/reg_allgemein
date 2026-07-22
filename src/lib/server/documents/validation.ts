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

const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04] as const;
const ZIP_END_RECORD = [0x50, 0x4b, 0x05, 0x06] as const;

const CONTAINER_OR_EXECUTABLE_SIGNATURES = [
	ZIP_LOCAL_HEADER,
	ZIP_END_RECORD,
	[0x50, 0x4b, 0x07, 0x08], // ZIP data descriptor
	[0x7f, 0x45, 0x4c, 0x46], // ELF
	[0xca, 0xfe, 0xba, 0xbe], // Mach-O universal
] as const;

function rejectContainerOrExecutablePrefix(bytes: Uint8Array): void {
	if (CONTAINER_OR_EXECUTABLE_SIGNATURES.some((signature) => hasPrefix(bytes, signature))) {
		throw new DocumentValidationError('DOCUMENT_POLYGLOT_REJECTED');
	}
	if (hasPrefix(bytes, [0x4d, 0x5a])) {
		throw new DocumentValidationError('DOCUMENT_EXECUTABLE_REJECTED');
	}
}

function rejectTrailingPayload(bytes: Uint8Array): never {
	if (
		CONTAINER_OR_EXECUTABLE_SIGNATURES.some((signature) => containsSequence(bytes, signature))
	) {
		throw new DocumentValidationError('DOCUMENT_POLYGLOT_REJECTED');
	}
	if (hasPrefix(bytes, [0x4d, 0x5a])) {
		throw new DocumentValidationError('DOCUMENT_EXECUTABLE_REJECTED');
	}
	throw new DocumentValidationError('DOCUMENT_TRAILING_PAYLOAD_REJECTED');
}

function containsPdfName(value: string, expectedName: string): boolean {
	// PDF names may escape any byte as `#HH` (ISO 32000). Inspect every name
	// token after decoding exactly one escape layer so `/Encr#79pt` cannot hide
	// an encryption dictionary from the upload boundary. A conservative match
	// outside the parsed object graph is an intentional safe rejection.
	for (const match of value.matchAll(
		/\/([^\u0000\u0009\u000a\u000c\u000d\u0020()<>\[\]{}/%]+)/g
	)) {
		const decoded = match[1].replace(/#([0-9a-f]{2})/gi, (_, hex: string) =>
			String.fromCharCode(Number.parseInt(hex, 16))
		);
		if (decoded === expectedName) return true;
	}
	return false;
}

function detectPdf(bytes: Uint8Array): boolean {
	if (!hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return false;
	// A PDF/ZIP dual-parser file can put the ZIP EOCD before the final PDF xref
	// and make that PDF tail the ZIP comment. Checking only bytes after %%EOF
	// therefore misses a valid embedded ZIP. Require both structural endpoints
	// to avoid rejecting an isolated marker inside ordinary compressed content.
	if (containsSequence(bytes, ZIP_LOCAL_HEADER) && containsSequence(bytes, ZIP_END_RECORD)) {
		throw new DocumentValidationError('DOCUMENT_POLYGLOT_REJECTED');
	}
	const fullText = ascii.decode(bytes);
	const eofOffset = fullText.lastIndexOf('%%EOF');
	if (eofOffset < 0) throw new DocumentValidationError('DOCUMENT_PDF_MALFORMED');
	const trailing = bytes.slice(eofOffset + 5);
	if (trailing.some((byte) => ![0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(byte))) {
		rejectTrailingPayload(trailing);
	}
	// Incremental PDFs may point to an older trailer through /Prev, so scanning
	// only the final revision would miss inherited encryption dictionaries.
	if (containsPdfName(fullText, 'Encrypt')) {
		throw new DocumentValidationError('DOCUMENT_PDF_ENCRYPTED');
	}
	return true;
}

function detectJpeg(bytes: Uint8Array): boolean {
	if (bytes.length < 6 || !hasPrefix(bytes, [0xff, 0xd8, 0xff])) return false;
	let offset = 2;
	while (offset < bytes.length) {
		if (bytes[offset] !== 0xff) return false;
		while (bytes[offset] === 0xff) offset += 1;
		const marker = bytes[offset++];
		if (marker === 0xd9) {
			if (offset !== bytes.length) rejectTrailingPayload(bytes.slice(offset));
			return true;
		}
		if (marker === 0x00 || marker === undefined) return false;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
		if (offset + 2 > bytes.length) return false;
		const length = (bytes[offset] << 8) | bytes[offset + 1];
		if (length < 2 || offset + length > bytes.length) return false;
		if (marker !== 0xda) {
			offset += length;
			continue;
		}
		offset += length;
		while (offset < bytes.length - 1) {
			if (bytes[offset] !== 0xff) {
				offset += 1;
				continue;
			}
			const next = bytes[offset + 1];
			if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
				offset += 2;
				continue;
			}
			break;
		}
	}
	return false;
}

function detectPng(bytes: Uint8Array): boolean {
	if (bytes.length < 33 || !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return false;
	}
	let offset = 8;
	let chunkIndex = 0;
	let sawIdat = false;
	while (offset + 12 <= bytes.length) {
		const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
		const length = view.getUint32(0, false);
		const type = ascii.decode(bytes.slice(offset + 4, offset + 8));
		if (!/^[A-Za-z]{4}$/u.test(type) || length > bytes.length - offset - 12) return false;
		const end = offset + 12 + length;
		if (chunkIndex === 0 && (type !== 'IHDR' || length !== 13)) return false;
		if (type === 'IDAT') sawIdat = true;
		if (type === 'IEND') {
			if (length !== 0 || !sawIdat) return false;
			if (end !== bytes.length) rejectTrailingPayload(bytes.slice(end));
			return true;
		}
		if (/^[A-Z]/u.test(type) && !['IHDR', 'PLTE', 'IDAT'].includes(type)) return false;
		offset = end;
		chunkIndex += 1;
	}
	return false;
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
	rejectContainerOrExecutablePrefix(body);

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
