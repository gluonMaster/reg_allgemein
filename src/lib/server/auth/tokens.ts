import { scopedHash, sha256Hex } from '$lib/server/security/digest';

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function deriveOpaqueAuthToken(input: {
	secret: string;
	tokenId: string;
	kind: 'email_verification' | 'password_reset';
}): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(input.secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(`kolibri-auth-token:v1:${input.kind}:${input.tokenId}`)
	);
	return base64Url(new Uint8Array(signature));
}

export async function hmacSha256Hex(secret: string, scope: string, value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		'HMAC',
		key,
		encoder.encode(`${scope.length}:${scope}:${value}`)
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
}

export function hashAuthToken(
	kind: 'email_verification' | 'password_reset',
	rawToken: string
): Promise<string> {
	return scopedHash(`auth-token:${kind}:v1`, rawToken);
}

export function hashCsrfToken(rawToken: string): Promise<string> {
	return scopedHash('auth-csrf:v1', rawToken);
}

export function hashSessionJti(rawJti: string): Promise<string> {
	return scopedHash('auth-session-jti:v1', rawJti);
}

export function createRandomToken(byteLength = 32): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

export async function privacyAcknowledgementEvidence(input: {
	privacyNoticeVersion: string;
	acceptanceText: string;
	sourceContext: string;
}): Promise<string> {
	return sha256Hex(
		JSON.stringify({
			privacyNoticeVersion: input.privacyNoticeVersion,
			acceptanceText: input.acceptanceText,
			sourceContext: input.sourceContext,
		})
	);
}

export function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);
	let difference = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}
	return difference === 0;
}
