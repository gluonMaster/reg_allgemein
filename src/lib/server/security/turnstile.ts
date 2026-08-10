import { z } from 'zod';

const turnstileResponseSchema = z.object({
	success: z.boolean(),
	action: z.string().optional(),
	hostname: z.string().optional(),
	'error-codes': z.array(z.string()).optional(),
});

const TURNSTILE_TOKEN_MAX_LENGTH = 2_048;
const TURNSTILE_SITEVERIFY_TIMEOUT_MS = 10_000;

export interface TurnstileVerifier {
	verify(input: { token: string; remoteIp?: string }): Promise<boolean>;
}

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
	constructor(
		private readonly secret: string,
		private readonly expectedAction: string,
		expectedHostnames: readonly string[],
		private readonly fetcher: typeof fetch = fetch
	) {
		this.expectedHostnames = new Set(
			expectedHostnames.map((hostname) => hostname.toLowerCase())
		);
	}

	private readonly expectedHostnames: ReadonlySet<string>;

	async verify(input: { token: string; remoteIp?: string }): Promise<boolean> {
		if (!input.token || input.token.length > TURNSTILE_TOKEN_MAX_LENGTH) return false;
		if (!this.expectedAction || this.expectedHostnames.size === 0) return false;

		const body = new URLSearchParams();
		body.set('secret', this.secret);
		body.set('response', input.token);
		if (input.remoteIp) body.set('remoteip', input.remoteIp);

		try {
			const response = await this.fetcher(
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
				{
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body,
					signal: AbortSignal.timeout(TURNSTILE_SITEVERIFY_TIMEOUT_MS),
				}
			);
			if (!response.ok) return false;
			const parsed = turnstileResponseSchema.safeParse(await response.json());
			return Boolean(
				parsed.success &&
				parsed.data.success &&
				parsed.data.action === this.expectedAction &&
				parsed.data.hostname &&
				this.expectedHostnames.has(parsed.data.hostname.toLowerCase())
			);
		} catch {
			return false;
		}
	}
}

export class FakeTurnstileVerifier implements TurnstileVerifier {
	constructor(private readonly acceptedToken = 'synthetic-turnstile-pass') {}

	async verify(input: { token: string }): Promise<boolean> {
		return input.token === this.acceptedToken;
	}
}

export class DenyTurnstileVerifier implements TurnstileVerifier {
	async verify(): Promise<boolean> {
		return false;
	}
}
