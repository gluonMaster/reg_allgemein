import { constantTimeEqual, hmacSha256Hex } from '$lib/server/auth/tokens';

export const VERIFIED_DEVICE_COOKIE = 'ti_verified';
export const VERIFIED_DEVICE_MAX_AGE = 180 * 86400;

export async function verifiedDeviceValue(secret: string, email: string): Promise<string> {
	const normalized = email.toLowerCase();
	const signature = await hmacSha256Hex(secret, 'trial-intake:device:v1', normalized);
	return JSON.stringify([normalized, signature]);
}

export async function matchesVerifiedDevice(
	secret: string,
	value: string | undefined,
	email: string
): Promise<boolean> {
	if (!value || value.length > 512) return false;
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			!Array.isArray(parsed) ||
			parsed.length !== 2 ||
			typeof parsed[0] !== 'string' ||
			typeof parsed[1] !== 'string' ||
			parsed[0] !== email.toLowerCase() ||
			!/^[a-f0-9]{64}$/u.test(parsed[1])
		)
			return false;
		const signature = await hmacSha256Hex(secret, 'trial-intake:device:v1', parsed[0]);
		return constantTimeEqual(signature, parsed[1]);
	} catch {
		return false;
	}
}
