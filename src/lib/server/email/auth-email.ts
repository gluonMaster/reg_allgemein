import { buildPortalUrl, type RuntimeConfig } from '$lib/server/config/runtime';
import { formatMessage, translate, type MessageKey } from '$lib/i18n';
import type { AuthRepository, AuthOutboxRow } from '$lib/server/auth/auth-repository';
import { deriveOpaqueAuthToken } from '$lib/server/auth/tokens';

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface EmailProvider {
	send(message: EmailMessage): Promise<{ providerRequestId: string }>;
}

export class EmailProviderError extends Error {
	readonly code: string;

	constructor(code: string) {
		super('Email provider operation failed.');
		this.name = 'EmailProviderError';
		this.code = code;
	}
}

export class DisabledEmailProvider implements EmailProvider {
	async send(): Promise<{ providerRequestId: string }> {
		throw new EmailProviderError('EMAIL_PROVIDER_DISABLED');
	}
}

export class FakeEmailProvider implements EmailProvider {
	readonly messages: EmailMessage[] = [];

	async send(message: EmailMessage): Promise<{ providerRequestId: string }> {
		this.messages.push(structuredClone(message));
		return { providerRequestId: `fake:${this.messages.length}` };
	}
}

function templateKeys(template: AuthOutboxRow['template_or_category']): {
	subject: MessageKey;
	body: MessageKey;
} {
	switch (template) {
		case 'auth.email_verification':
			return {
				subject: 'auth.email.verification.subject',
				body: 'auth.email.verification.body',
			};
		case 'auth.email_change_verification':
			return { subject: 'auth.email.change.subject', body: 'auth.email.change.body' };
		case 'auth.password_reset':
			return { subject: 'auth.email.reset.subject', body: 'auth.email.reset.body' };
		case 'auth.welcome':
			return { subject: 'auth.email.welcome.subject', body: 'auth.email.welcome.body' };
		case 'auth.password_changed':
			return {
				subject: 'auth.email.passwordChanged.subject',
				body: 'auth.email.passwordChanged.body',
			};
		case 'claim.legacy_email_proof':
			return {
				subject: 'claim.email.proof.subject',
				body: 'claim.email.proof.body',
			};
	}
}

function retryAt(now: string, attempts: number): string {
	const seconds = Math.min(3_600, 60 * 2 ** Math.max(0, attempts));
	return new Date(Date.parse(now) + seconds * 1000).toISOString();
}

export class AuthEmailDispatcher {
	constructor(
		private readonly repository: AuthRepository,
		private readonly provider: EmailProvider,
		private readonly secret: string,
		private readonly config: Pick<RuntimeConfig, 'portalPublicOrigin'>,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	private async linkFor(row: AuthOutboxRow): Promise<string | null> {
		if (!row.token_id || !row.token_kind) return null;
		const kind = row.token_kind;
		const token = await deriveOpaqueAuthToken({ secret: this.secret, tokenId: row.token_id, kind });
		const path =
			kind === 'password_reset'
				? `/auth/reset?token=${encodeURIComponent(token)}`
				: kind === 'legacy_email_claim'
					? `/cabinet/legacy-claim?token=${encodeURIComponent(token)}`
					: `/auth/verify?token=${encodeURIComponent(token)}`;
		return buildPortalUrl(this.config, path).toString();
	}

	async dispatchNext(): Promise<'empty' | 'sent' | 'retry' | 'dead'> {
		const now = this.now();
		const row = await this.repository.nextPendingOutbox(now);
		if (!row) return 'empty';
		if (!(await this.repository.lockOutbox(row.id, now))) return 'empty';

		try {
			const keys = templateKeys(row.template_or_category);
			const link = await this.linkFor(row);
			const body = link
				? formatMessage(row.locale, keys.body, { link })
				: translate(row.locale, keys.body);
			const result = await this.provider.send({
				to: row.email,
				subject: translate(row.locale, keys.subject),
				text: body,
			});
			await this.repository.markOutboxSent(row.id, result.providerRequestId, now);
			return 'sent';
		} catch (error) {
			const errorCode = error instanceof EmailProviderError ? error.code : 'EMAIL_PROVIDER_FAILURE';
			await this.repository.markOutboxFailed({
				id: row.id,
				errorCode,
				nextAttemptAt: retryAt(now, row.attempts),
				now,
			});
			return row.attempts + 1 >= row.max_attempts ? 'dead' : 'retry';
		}
	}
}
