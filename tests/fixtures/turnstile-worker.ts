import { CloudflareTurnstileVerifier } from '../../src/lib/server/security/turnstile';

export default {
	async fetch(): Promise<Response> {
		const verifier = new CloudflareTurnstileVerifier('synthetic-secret', 'registration', [
			'preview.example.test',
		]);
		return Response.json({
			success: await verifier.verify({ token: 'synthetic-token' }),
		});
	},
};
