import { z } from 'zod';

const turnstileResponseSchema = z.object({
	success: z.boolean(),
	'error-codes': z.array(z.string()).optional(),
});

export interface TurnstileVerifier {
	verify(input: { token: string; remoteIp?: string }): Promise<boolean>;
}

export class CloudflareTurnstileVerifier implements TurnstileVerifier {
	constructor(
		private readonly secret: string,
		private readonly fetcher: typeof fetch = fetch
	) {}

	async verify(input: { token: string; remoteIp?: string }): Promise<boolean> {
		const body = new FormData();
		body.set('secret', this.secret);
		body.set('response', input.token);
		if (input.remoteIp) body.set('remoteip', input.remoteIp);

		try {
			const response = await this.fetcher(
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
				{ method: 'POST', body }
			);
			if (!response.ok) return false;
			const parsed = turnstileResponseSchema.safeParse(await response.json());
			return parsed.success && parsed.data.success;
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
