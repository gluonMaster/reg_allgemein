import type { StatementSpec } from '$lib/server/db/database';
import { DatabaseBoundary } from '$lib/server/db/database';
import type {
	EmailOutboxRow,
	EmailOutboxStore,
	OutboxClaimInput,
	OutboxFailureInput,
} from '$lib/server/outbox/contracts';
import { OutboxRepository } from '$lib/server/outbox/outbox-repository';

export interface LoginUserRow {
	id: string;
	email_normalized: string;
	password_hash: string;
	email_verified_at: string | null;
	role: 'parent' | 'admin';
	is_blocked: 0 | 1;
	account_status: 'active' | 'deletion_requested' | 'closed';
	session_version: number;
}

export interface SessionUserRow {
	session_id: string;
	user_id: string;
	jti_hash: string;
	csrf_hash: string;
	session_version: number;
	session_user_version: number;
	expires_at: string;
	revoked_at: string | null;
	role: 'parent' | 'admin';
	email_verified_at: string | null;
	is_blocked: 0 | 1;
	account_status: 'active' | 'deletion_requested' | 'closed';
}

export interface EmailTokenContext {
	id: string;
	user_id: string;
	target_email_normalized: string;
	email_version: number;
	expires_at: string;
	current_email_normalized: string;
	pending_email_normalized: string | null;
	pending_email_expires_at: string | null;
	email_verified_at: string | null;
	account_status: 'active' | 'deletion_requested' | 'closed';
	is_blocked: 0 | 1;
}

export interface VerificationExtensionContext {
	verificationRequestId: string;
	verificationTokenId: string;
	userId: string;
	targetEmailNormalized: string;
	now: string;
}

/**
 * Stage 06 may append guarded family-finalization statements to the same D1 batch.
 * Every mutation must be conditional on auth_verification_commits.request_id from
 * the supplied context; an assertion statement should fail the batch if the
 * promoted snapshot or family finalization cannot be completed safely.
 */
export interface PostVerificationExtension {
	prepare(context: VerificationExtensionContext): Promise<readonly StatementSpec[]>;
}

export const noPostVerificationExtension: PostVerificationExtension = {
	async prepare() {
		return [];
	},
};

export interface AuthOutboxRow {
	id: string;
	source_id: string;
	template_or_category:
		| 'auth.email_verification'
		| 'auth.password_reset'
		| 'auth.email_change_verification'
		| 'auth.welcome'
		| 'auth.password_changed'
		| 'claim.legacy_email_proof';
	recipient_address_kind: 'current' | 'pending' | 'legacy';
	locale: string;
	payload_json: string;
	attempts: number;
	max_attempts: number;
	email: string;
	token_id: string | null;
	token_kind: 'email_verification' | 'password_reset' | 'legacy_email_claim' | null;
	user_id: string;
}

export class AuthRepository implements EmailOutboxStore {
	private readonly commonOutbox: OutboxRepository;

	constructor(private readonly db: DatabaseBoundary) {
		this.commonOutbox = new OutboxRepository(db);
	}

	async register(input: {
		userId: string;
		acknowledgementId: string;
		tokenId: string;
		outboxId: string;
		auditId: string;
		email: string;
		emailNormalized: string;
		passwordHash: string;
		firstName: string;
		lastName: string;
		firstNameNormalized: string;
		lastNameNormalized: string;
		privacyNoticeVersion: string;
		privacyEvidenceHash: string;
		privacySourceContext: string;
		tokenHash: string;
		tokenExpiresAt: string;
		requestedSubjectHash: string;
		requestId: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const results = await this.db.batch([
			{
				sql: `UPDATE users
					SET pending_email = NULL, pending_email_normalized = NULL,
						pending_email_expires_at = NULL, email_version = email_version + 1,
						updated_at = ?
					WHERE pending_email_normalized = ? AND pending_email_expires_at <= ?`,
				params: [input.now, input.emailNormalized, input.now],
			},
			{
				sql: `INSERT OR IGNORE INTO users
					(id, email, email_normalized, password_hash, role, first_name, last_name,
					 first_name_normalized, last_name_normalized, preferred_language,
					 privacy_notice_version, privacy_accepted_at, created_at, updated_at)
					SELECT ?, ?, ?, ?, 'parent', ?, ?, ?, ?, 'de', ?, ?, ?, ?
					WHERE NOT EXISTS (
						SELECT 1 FROM users WHERE email_normalized = ?
					) AND NOT EXISTS (
						SELECT 1 FROM users WHERE pending_email_normalized = ?
					)`,
				params: [
					input.userId,
					input.email,
					input.emailNormalized,
					input.passwordHash,
					input.firstName,
					input.lastName,
					input.firstNameNormalized,
					input.lastNameNormalized,
					input.privacyNoticeVersion,
					input.now,
					input.now,
					input.now,
					input.emailNormalized,
					input.emailNormalized,
				],
			},
			{
				sql: `INSERT INTO privacy_acknowledgements
					(id, user_id, privacy_notice_version, acknowledged_at, evidence_hash,
					 source_context, created_at)
					SELECT ?, id, ?, ?, ?, ?, ? FROM users WHERE id = ?`,
				params: [
					input.acknowledgementId,
					input.privacyNoticeVersion,
					input.now,
					input.privacyEvidenceHash,
					input.privacySourceContext,
					input.now,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO auth_tokens
					(id, user_id, kind, token_hash, target_email_normalized, email_version,
					 expires_at, requested_subject_hash, created_at)
					SELECT ?, id, 'email_verification', ?, email_normalized, email_version,
						?, ?, ? FROM users WHERE id = ?`,
				params: [
					input.tokenId,
					input.tokenHash,
					input.tokenExpiresAt,
					input.requestedSubjectHash,
					input.now,
					input.userId,
				],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_token', id, 'auth.email_verification', user_id,
						'current', 'de', '{}', ?, ?, ?, ?
					FROM auth_tokens WHERE id = ?`,
				params: [
					input.outboxId,
					`auth-token:${input.tokenId}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.tokenId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, NULL, 'anonymous', 'auth.registration_created', 'user', id,
						?, '{"role":"parent"}', ? FROM users WHERE id = ?`,
				params: [input.auditId, input.requestId, input.now, input.userId],
			},
		]);

		return results[1]?.meta.changes === 1;
	}

	findLoginUser(emailNormalized: string): Promise<LoginUserRow | null> {
		return this.db.first<LoginUserRow>({
			sql: `SELECT id, email_normalized, password_hash, email_verified_at, role,
				is_blocked, account_status, session_version
			FROM users WHERE email_normalized = ?`,
			params: [emailNormalized],
		});
	}

	async enqueueVerification(input: {
		tokenId: string;
		tokenHash: string;
		outboxId: string;
		emailNormalized: string;
		expiresAt: string;
		cooldownAfter: string;
		requestedSubjectHash: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const results = await this.db.batch([
			{
				sql: `INSERT INTO auth_tokens
					(id, user_id, kind, token_hash, target_email_normalized, email_version,
					 expires_at, requested_subject_hash, created_at)
					SELECT ?, id, 'email_verification', ?, email_normalized, email_version,
						?, ?, ? FROM users
					WHERE email_normalized = ? AND email_verified_at IS NULL
						AND is_blocked = 0 AND account_status = 'active'
						AND NOT EXISTS (
							SELECT 1 FROM auth_tokens previous
							WHERE previous.user_id = users.id
								AND previous.kind = 'email_verification'
								AND previous.target_email_normalized = users.email_normalized
								AND previous.created_at > ?
						)`,
				params: [
					input.tokenId,
					input.tokenHash,
					input.expiresAt,
					input.requestedSubjectHash,
					input.now,
					input.emailNormalized,
					input.cooldownAfter,
				],
			},
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id <> ? AND user_id = (SELECT user_id FROM auth_tokens WHERE id = ?)
						AND kind = 'email_verification' AND used_at IS NULL
						AND target_email_normalized = ?
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [
					input.now,
					`superseded:${input.tokenId}`,
					input.tokenId,
					input.tokenId,
					input.emailNormalized,
					input.tokenId,
				],
			},
			{
				sql: `UPDATE email_outbox SET status = 'cancelled'
					WHERE source_kind = 'auth_token' AND source_id <> ?
						AND recipient_user_id = (SELECT user_id FROM auth_tokens WHERE id = ?)
						AND template_or_category = 'auth.email_verification'
						AND status IN ('pending', 'retry')
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [input.tokenId, input.tokenId, input.tokenId],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_token', id, 'auth.email_verification', user_id,
						'current', 'de', '{}', ?, ?, ?, ?
					FROM auth_tokens WHERE id = ?`,
				params: [
					input.outboxId,
					`auth-token:${input.tokenId}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.tokenId,
				],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	findEmailToken(tokenHash: string, now: string): Promise<EmailTokenContext | null> {
		return this.db.first<EmailTokenContext>({
			sql: `SELECT t.id, t.user_id, t.target_email_normalized, t.email_version,
				t.expires_at, u.email_normalized AS current_email_normalized,
				u.pending_email_normalized, u.pending_email_expires_at,
				u.email_verified_at, u.account_status, u.is_blocked
			FROM auth_tokens t JOIN users u ON u.id = t.user_id
			WHERE t.token_hash = ? AND t.kind = 'email_verification'
				AND t.used_at IS NULL AND t.expires_at > ?`,
			params: [tokenHash, now],
		});
	}

	async verifyCurrentEmail(input: {
		context: EmailTokenContext;
		verificationRequestId: string;
		auditId: string;
		welcomeOutboxId: string;
		now: string;
		emailMaxAttempts: number;
		extension: PostVerificationExtension;
	}): Promise<boolean> {
		const extensionContext: VerificationExtensionContext = {
			verificationRequestId: input.verificationRequestId,
			verificationTokenId: input.context.id,
			userId: input.context.user_id,
			targetEmailNormalized: input.context.target_email_normalized,
			now: input.now,
		};
		const extensionStatements = await input.extension.prepare(extensionContext);
		const results = await this.db.batch([
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id = ? AND used_at IS NULL AND expires_at > ?
						AND target_email_normalized = ? AND email_version = ?
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND account_status = 'active'
								AND is_blocked = 0 AND email_verified_at IS NULL
								AND email_normalized = ? AND email_version = ?
						)`,
				params: [
					input.now,
					input.verificationRequestId,
					input.context.id,
					input.now,
					input.context.target_email_normalized,
					input.context.email_version,
					input.context.user_id,
					input.context.target_email_normalized,
					input.context.email_version,
				],
			},
			{
				sql: `INSERT INTO auth_verification_commits
					(request_id, token_id, user_id, target_email_normalized, created_at)
					SELECT ?, id, user_id, target_email_normalized, ? FROM auth_tokens
					WHERE id = ? AND used_by_request_id = ?`,
				params: [
					input.verificationRequestId,
					input.now,
					input.context.id,
					input.verificationRequestId,
				],
			},
			{
				sql: `UPDATE users SET email_verified_at = ?, updated_at = ?
					WHERE id = ? AND email_verified_at IS NULL
						AND EXISTS (
							SELECT 1 FROM auth_verification_commits WHERE request_id = ?
								AND user_id = users.id
						)`,
				params: [
					input.now,
					input.now,
					input.context.user_id,
					input.verificationRequestId,
				],
			},
			...extensionStatements,
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_verification', request_id, 'auth.welcome', user_id,
						'current', 'de', '{}', ?, ?, ?, ?
					FROM auth_verification_commits WHERE request_id = ?`,
				params: [
					input.welcomeOutboxId,
					`auth-welcome:${input.context.user_id}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.verificationRequestId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, user_id, 'user', 'auth.email_verified', 'user', user_id,
						request_id, '{"email_verified":true}', ?
					FROM auth_verification_commits WHERE request_id = ?`,
				params: [input.auditId, input.now, input.verificationRequestId],
			},
		]);

		return results[0]?.meta.changes === 1;
	}

	async enqueuePasswordReset(input: {
		tokenId: string;
		tokenHash: string;
		outboxId: string;
		emailNormalized: string;
		expiresAt: string;
		requestedSubjectHash: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const results = await this.db.batch([
			{
				sql: `INSERT INTO auth_tokens
					(id, user_id, kind, token_hash, target_email_normalized, email_version,
					 expires_at, requested_subject_hash, created_at)
					SELECT ?, id, 'password_reset', ?, email_normalized, email_version,
						?, ?, ? FROM users
					WHERE email_normalized = ? AND account_status = 'active' AND is_blocked = 0`,
				params: [
					input.tokenId,
					input.tokenHash,
					input.expiresAt,
					input.requestedSubjectHash,
					input.now,
					input.emailNormalized,
				],
			},
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id <> ? AND user_id = (SELECT user_id FROM auth_tokens WHERE id = ?)
						AND kind = 'password_reset' AND used_at IS NULL
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [
					input.now,
					`superseded:${input.tokenId}`,
					input.tokenId,
					input.tokenId,
					input.tokenId,
				],
			},
			{
				sql: `UPDATE email_outbox SET status = 'cancelled'
					WHERE source_kind = 'auth_token' AND source_id <> ?
						AND recipient_user_id = (SELECT user_id FROM auth_tokens WHERE id = ?)
						AND template_or_category = 'auth.password_reset'
						AND status IN ('pending', 'retry')
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [input.tokenId, input.tokenId, input.tokenId],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_token', id, 'auth.password_reset', user_id,
						'current', 'de', '{}', ?, ?, ?, ?
					FROM auth_tokens WHERE id = ?`,
				params: [
					input.outboxId,
					`auth-token:${input.tokenId}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.tokenId,
				],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	async consumePasswordReset(input: {
		tokenHash: string;
		passwordHash: string;
		requestId: string;
		auditId: string;
		outboxId: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const token = await this.db.first<{ id: string; user_id: string }>({
			sql: `SELECT t.id, t.user_id FROM auth_tokens t JOIN users u ON u.id = t.user_id
			WHERE t.token_hash = ? AND t.kind = 'password_reset' AND t.used_at IS NULL
				AND t.expires_at > ? AND t.email_version = u.email_version
				AND t.target_email_normalized = u.email_normalized
				AND u.account_status = 'active' AND u.is_blocked = 0`,
			params: [input.tokenHash, input.now],
		});
		if (!token) return false;

		const results = await this.db.batch([
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id = ? AND used_at IS NULL AND expires_at > ?
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND account_status = 'active'
								AND is_blocked = 0 AND email_version = auth_tokens.email_version
								AND email_normalized = auth_tokens.target_email_normalized
						)`,
				params: [input.now, input.requestId, token.id, input.now, token.user_id],
			},
			{
				sql: `UPDATE users SET password_hash = ?, session_version = session_version + 1,
						updated_at = ?
					WHERE id = ? AND EXISTS (
						SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?
					)`,
				params: [input.passwordHash, input.now, token.user_id, token.id, input.requestId],
			},
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'password_reset'
					WHERE user_id = ? AND revoked_at IS NULL
						AND EXISTS (
							SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?
						)`,
				params: [input.now, token.user_id, token.id, input.requestId],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_event', id, 'auth.password_changed', user_id,
						'current', 'de', '{}', ?, ?, ?, ? FROM auth_tokens
					WHERE id = ? AND used_by_request_id = ?`,
				params: [
					input.outboxId,
					`auth-password-changed:${token.id}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					token.id,
					input.requestId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, user_id, 'user', 'auth.password_reset', 'user', user_id,
						?, '{"sessions_revoked":true}', ? FROM auth_tokens
					WHERE id = ? AND used_by_request_id = ?`,
				params: [input.auditId, input.requestId, input.now, token.id, input.requestId],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	async createSession(input: {
		id: string;
		userId: string;
		jtiHash: string;
		csrfHash: string;
		sessionVersion: number;
		expiresAt: string;
		now: string;
	}): Promise<boolean> {
		const result = await this.db.run({
			sql: `INSERT INTO auth_sessions
				(id, user_id, jti_hash, csrf_hash, session_version, expires_at,
				 created_at, last_seen_at)
				SELECT ?, id, ?, ?, session_version, ?, ?, ? FROM users
				WHERE id = ? AND session_version = ? AND email_verified_at IS NOT NULL
					AND is_blocked = 0 AND account_status = 'active'`,
			params: [
				input.id,
				input.jtiHash,
				input.csrfHash,
				input.expiresAt,
				input.now,
				input.now,
				input.userId,
				input.sessionVersion,
			],
		});
		return result.meta.changes === 1;
	}

	findSession(id: string, jtiHash: string): Promise<SessionUserRow | null> {
		return this.db.first<SessionUserRow>({
			sql: `SELECT s.id AS session_id, s.user_id, s.jti_hash, s.csrf_hash,
				s.session_version, u.session_version AS session_user_version,
				s.expires_at, s.revoked_at, u.role, u.email_verified_at,
				u.is_blocked, u.account_status
			FROM auth_sessions s JOIN users u ON u.id = s.user_id
			WHERE s.id = ? AND s.jti_hash = ?`,
			params: [id, jtiHash],
		});
	}

	async touchSession(id: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE auth_sessions SET last_seen_at = ?
				WHERE id = ? AND revoked_at IS NULL AND last_seen_at < ?`,
			params: [now, id, now],
		});
	}

	async revokeSession(input: {
		sessionId: string;
		userId: string;
		reason: string;
		requestId: string;
		auditId: string;
		now: string;
	}): Promise<boolean> {
		const results = await this.db.batch([
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = ?
					WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
				params: [input.now, input.reason, input.sessionId, input.userId],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, ?, 'user', 'auth.session_revoked', 'auth_session', id,
						?, '{"reason":"logout"}', ? FROM auth_sessions
					WHERE id = ? AND user_id = ? AND revoked_at = ?`,
				params: [
					input.auditId,
					input.userId,
					input.requestId,
					input.now,
					input.sessionId,
					input.userId,
					input.now,
				],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	async revokeAllSessions(input: {
		userId: string;
		reason: string;
		requestId: string;
		auditId: string;
		now: string;
	}): Promise<number> {
		const results = await this.db.batch([
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = ?
					WHERE user_id = ? AND revoked_at IS NULL`,
				params: [input.now, input.reason, input.userId],
			},
			{
				sql: `UPDATE users SET session_version = session_version + 1, updated_at = ?
					WHERE id = ? AND account_status = 'active'`,
				params: [input.now, input.userId],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, id, 'user', 'auth.sessions_revoked', 'user', id,
						?, '{"all_sessions":true}', ? FROM users WHERE id = ?`,
				params: [input.auditId, input.requestId, input.now, input.userId],
			},
		]);
		return results[0]?.meta.changes ?? 0;
	}

	async requestEmailChange(input: {
		userId: string;
		expectedEmailVersion: number;
		pendingEmail: string;
		pendingEmailNormalized: string;
		pendingExpiresAt: string;
		tokenId: string;
		tokenHash: string;
		outboxId: string;
		requestedSubjectHash: string;
		now: string;
		emailMaxAttempts: number;
	}): Promise<boolean> {
		const newVersion = input.expectedEmailVersion + 1;
		const results = await this.db.batch([
			{
				sql: `UPDATE users
					SET pending_email = NULL, pending_email_normalized = NULL,
						pending_email_expires_at = NULL, email_version = email_version + 1,
						updated_at = ?
					WHERE pending_email_normalized = ? AND pending_email_expires_at <= ?
						AND id <> ?`,
				params: [input.now, input.pendingEmailNormalized, input.now, input.userId],
			},
			{
				sql: `UPDATE users SET pending_email = ?, pending_email_normalized = ?,
						pending_email_expires_at = ?, email_version = ?, updated_at = ?
					WHERE id = ? AND email_version = ? AND account_status = 'active'
						AND is_blocked = 0 AND email_verified_at IS NOT NULL
						AND email_normalized <> ?
						AND NOT EXISTS (SELECT 1 FROM users current_email
							WHERE current_email.email_normalized = ? AND current_email.id <> users.id)
						AND NOT EXISTS (SELECT 1 FROM users reservation
							WHERE reservation.pending_email_normalized = ? AND reservation.id <> users.id)`,
				params: [
					input.pendingEmail,
					input.pendingEmailNormalized,
					input.pendingExpiresAt,
					newVersion,
					input.now,
					input.userId,
					input.expectedEmailVersion,
					input.pendingEmailNormalized,
					input.pendingEmailNormalized,
					input.pendingEmailNormalized,
				],
			},
			{
				sql: `INSERT INTO auth_tokens
					(id, user_id, kind, token_hash, target_email_normalized, email_version,
					 expires_at, requested_subject_hash, created_at)
					SELECT ?, id, 'email_verification', ?, pending_email_normalized,
						email_version, ?, ?, ? FROM users
					WHERE id = ? AND email_version = ? AND pending_email_normalized = ?`,
				params: [
					input.tokenId,
					input.tokenHash,
					input.pendingExpiresAt,
					input.requestedSubjectHash,
					input.now,
					input.userId,
					newVersion,
					input.pendingEmailNormalized,
				],
			},
			{
				sql: `UPDATE email_outbox SET status = 'cancelled'
					WHERE source_kind = 'auth_token' AND source_id <> ?
						AND recipient_user_id = ?
						AND template_or_category = 'auth.email_change_verification'
						AND status IN ('pending', 'retry')
						AND EXISTS (SELECT 1 FROM auth_tokens WHERE id = ?)`,
				params: [input.tokenId, input.userId, input.tokenId],
			},
			{
				sql: `INSERT INTO email_outbox
					(id, source_kind, source_id, template_or_category, recipient_user_id,
					 recipient_address_kind, locale, payload_json, dedupe_key, not_before,
					 max_attempts, created_at)
					SELECT ?, 'auth_token', id, 'auth.email_change_verification', user_id,
						'pending', 'de', '{}', ?, ?, ?, ? FROM auth_tokens WHERE id = ?`,
				params: [
					input.outboxId,
					`auth-token:${input.tokenId}`,
					input.now,
					input.emailMaxAttempts,
					input.now,
					input.tokenId,
				],
			},
		]);
		return results[1]?.meta.changes === 1;
	}

	async confirmPendingEmail(input: {
		context: EmailTokenContext;
		requestId: string;
		auditId: string;
		now: string;
	}): Promise<boolean> {
		const results = await this.db.batch([
			{
				sql: `UPDATE auth_tokens SET used_at = ?, used_by_request_id = ?
					WHERE id = ? AND used_at IS NULL AND expires_at > ?
						AND target_email_normalized = ? AND email_version = ?
						AND EXISTS (
							SELECT 1 FROM users WHERE id = ? AND account_status = 'active'
								AND is_blocked = 0 AND email_version = ?
								AND pending_email_normalized = ?
								AND pending_email_expires_at > ?
								AND NOT EXISTS (
									SELECT 1 FROM users conflict
									WHERE conflict.email_normalized = ? AND conflict.id <> users.id
								)
						)`,
				params: [
					input.now,
					input.requestId,
					input.context.id,
					input.now,
					input.context.target_email_normalized,
					input.context.email_version,
					input.context.user_id,
					input.context.email_version,
					input.context.target_email_normalized,
					input.now,
					input.context.target_email_normalized,
				],
			},
			{
				sql: `UPDATE users SET email = pending_email,
						email_normalized = pending_email_normalized, pending_email = NULL,
						pending_email_normalized = NULL, pending_email_expires_at = NULL,
						email_verified_at = ?, session_version = session_version + 1,
						updated_at = ?
					WHERE id = ? AND EXISTS (
						SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?
					)`,
				params: [
					input.now,
					input.now,
					input.context.user_id,
					input.context.id,
					input.requestId,
				],
			},
			{
				sql: `UPDATE auth_sessions SET revoked_at = ?, revocation_reason = 'email_change'
					WHERE user_id = ? AND revoked_at IS NULL AND EXISTS (
						SELECT 1 FROM auth_tokens WHERE id = ? AND used_by_request_id = ?
					)`,
				params: [
					input.now,
					input.context.user_id,
					input.context.id,
					input.requestId,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, created_at)
					SELECT ?, user_id, 'user', 'auth.email_changed', 'user', user_id,
						?, '{"sessions_revoked":true}', ? FROM auth_tokens
					WHERE id = ? AND used_by_request_id = ?`,
				params: [input.auditId, input.requestId, input.now, input.context.id, input.requestId],
			},
		]);
		return results[0]?.meta.changes === 1;
	}

	async cleanupExpiredEmailReservations(now: string, limit = 100): Promise<number> {
		const result = await this.db.run({
			sql: `UPDATE users
				SET pending_email = NULL, pending_email_normalized = NULL,
					pending_email_expires_at = NULL, email_version = email_version + 1,
					updated_at = ?
				WHERE id IN (SELECT id FROM users
					WHERE pending_email_expires_at IS NOT NULL AND pending_email_expires_at <= ?
					ORDER BY pending_email_expires_at, id LIMIT ?)`,
			params: [now, now, limit],
		});
		return result.meta.changes ?? 0;
	}

	async getUserEmailVersion(userId: string): Promise<{
		email_version: number;
		email_normalized: string;
	} | null> {
		return this.db.first({
			sql: `SELECT email_version, email_normalized FROM users
				WHERE id = ? AND account_status = 'active' AND is_blocked = 0
					AND email_verified_at IS NOT NULL`,
			params: [userId],
		});
	}

	async nextPendingOutbox(now: string): Promise<AuthOutboxRow | null> {
		return this.db.first<AuthOutboxRow>({
			sql: `SELECT o.id, o.source_id, o.template_or_category,
				o.recipient_address_kind, o.locale, o.payload_json, o.attempts,
				o.max_attempts, o.recipient_user_id AS user_id,
				CASE o.recipient_address_kind
					WHEN 'legacy' THEN legacy_email.email_raw
					WHEN 'pending' THEN u.pending_email
					ELSE u.email
				END AS email,
				t.id AS token_id, t.kind AS token_kind
			FROM email_outbox o
			JOIN users u ON u.id = o.recipient_user_id
			LEFT JOIN legacy_family_emails AS legacy_email
				ON legacy_email.id = o.recipient_legacy_email_id
			LEFT JOIN auth_tokens t ON o.source_kind = 'auth_token' AND t.id = o.source_id
			WHERE o.status IN ('pending', 'retry') AND o.not_before <= ?
				AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
				AND (
					o.source_kind <> 'auth_token'
					OR (
						t.used_at IS NULL AND t.expires_at > ?
						AND (
							(o.recipient_address_kind = 'current'
								AND t.target_email_normalized = u.email_normalized
								AND t.email_version = u.email_version)
							OR
							(o.recipient_address_kind = 'pending'
								AND t.target_email_normalized = u.pending_email_normalized
								AND t.email_version = u.email_version)
							OR
							(o.recipient_address_kind = 'legacy'
								AND t.kind = 'legacy_email_claim'
								AND t.user_id = u.id
								AND t.family_version = u.family_version
								AND t.legacy_family_id = legacy_email.legacy_family_id
								AND t.target_email_normalized = legacy_email.email_normalized
								AND legacy_email.is_current = 1)
						)
					)
				)
			ORDER BY o.created_at, o.id LIMIT 1`,
			params: [now, now, now],
		});
	}

	async lockOutbox(id: string, now: string): Promise<boolean> {
		const result = await this.db.run({
			sql: `UPDATE email_outbox SET status = 'processing', locked_at = ?
				WHERE id = ? AND status IN ('pending', 'retry')`,
			params: [now, id],
		});
		return result.meta.changes === 1;
	}

	async markOutboxSent(id: string, providerRequestId: string, now: string): Promise<void> {
		await this.db.run({
			sql: `UPDATE email_outbox SET status = 'sent', sent_at = ?, locked_at = NULL,
					provider_request_id = ?, attempts = attempts + 1, last_error_code = NULL
				WHERE id = ? AND status = 'processing'`,
			params: [now, providerRequestId, id],
		});
	}

	async markOutboxFailed(input: {
		id: string;
		errorCode: string;
		nextAttemptAt: string;
		now: string;
	}): Promise<void> {
		await this.db.run({
			sql: `UPDATE email_outbox SET
					status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'retry' END,
					attempts = attempts + 1, last_error_code = ?, locked_at = NULL,
					next_attempt_at = CASE WHEN attempts + 1 >= max_attempts THEN NULL ELSE ? END
				WHERE id = ? AND status = 'processing'`,
			params: [input.errorCode, input.nextAttemptAt, input.id],
		});
	}

	cancelInvalidEmailRows(now: string): Promise<number> {
		return this.commonOutbox.cancelInvalidEmailRows(now);
	}

	claimEmail(input: OutboxClaimInput): Promise<EmailOutboxRow | null> {
		return this.commonOutbox.claimEmail(input);
	}

	markEmailSent(input: {
		id: string;
		leaseOwner: string;
		providerRequestId: string;
		now: string;
	}): Promise<boolean> {
		return this.commonOutbox.markEmailSent(input);
	}

	markEmailFailed(input: OutboxFailureInput): Promise<'retry' | 'dead' | 'lost_lease'> {
		return this.commonOutbox.markEmailFailed(input);
	}

}
