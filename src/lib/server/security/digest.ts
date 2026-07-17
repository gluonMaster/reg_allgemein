const textEncoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
	return bytesToHex(digest);
}

export async function sha256Bytes(value: BufferSource): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', value);
	return bytesToHex(digest);
}

function bytesToHex(value: ArrayBuffer): string {
	return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}

export function isSha256Hex(value: string): boolean {
	return /^[a-f0-9]{64}$/.test(value);
}

export async function scopedHash(scope: string, value: string): Promise<string> {
	return sha256Hex(`${scope.length}:${scope}:${value}`);
}
