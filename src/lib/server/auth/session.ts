import { SignJWT, jwtVerify } from 'jose';
import type { Cookies } from '@sveltejs/kit';
import type { PortalEnvironment } from '$lib/server/config/runtime';
import { hashCsrfToken, hashSessionJti, createRandomToken } from './tokens';
import type { AuthRepository } from './auth-repository';

export const SESSION_COOKIE_NAME = 'kolibri_session';
export const CSRF_COOKIE_NAME = 'kolibri_csrf';

const ISSUER = 'kolibri-registration-portal';
const AUDIENCE = 'kolibri-parent-session';

export interface AuthenticatedUser {
	id: string;
	role: 'parent' | 'admin';
	emailVerified: boolean;
	sessionId: string;
	sessionVersion: number;
	csrfHash: string;
}

export interface CreatedSession {
	sessionToken: string;
	csrfToken: string;
	expiresAt: string;
	sessionId: string;
}

interface SessionClaims {
	sub: string;
	jti: string;
	sid: string;
	sv: number;
}

function secretKey(secret: string): Uint8Array {
	return new TextEncoder().encode(secret);
}

function epochSeconds(instant: string): number {
	return Math.floor(Date.parse(instant) / 1000);
}

export class SessionService {
	constructor(
		private readonly repository: AuthRepository,
		private readonly secret: string,
		private readonly ttlSeconds: number
	) {}

	async create(input: {
		userId: string;
		sessionVersion: number;
		now: string;
	}): Promise<CreatedSession | null> {
		const sessionId = crypto.randomUUID();
		const jti = createRandomToken();
		const csrfToken = createRandomToken();
		const expiresAt = new Date(Date.parse(input.now) + this.ttlSeconds * 1000).toISOString();
		const jtiHash = await hashSessionJti(jti);
		const csrfHash = await hashCsrfToken(csrfToken);
		const created = await this.repository.createSession({
			id: sessionId,
			userId: input.userId,
			jtiHash,
			csrfHash,
			sessionVersion: input.sessionVersion,
			expiresAt,
			now: input.now,
		});
		if (!created) return null;

		const sessionToken = await new SignJWT({ sid: sessionId, sv: input.sessionVersion })
			.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
			.setIssuer(ISSUER)
			.setAudience(AUDIENCE)
			.setSubject(input.userId)
			.setJti(jti)
			.setIssuedAt(epochSeconds(input.now))
			.setExpirationTime(epochSeconds(expiresAt))
			.sign(secretKey(this.secret));

		return { sessionToken, csrfToken, expiresAt, sessionId };
	}

	async authenticate(sessionToken: string | undefined, now: string): Promise<AuthenticatedUser | null> {
		if (!sessionToken) return null;

		try {
			const verified = await jwtVerify(sessionToken, secretKey(this.secret), {
				issuer: ISSUER,
				audience: AUDIENCE,
				algorithms: ['HS256'],
				currentDate: new Date(now),
			});
			const claims = verified.payload as unknown as SessionClaims;
			if (
				typeof claims.sub !== 'string' ||
				typeof claims.jti !== 'string' ||
				typeof claims.sid !== 'string' ||
				!Number.isSafeInteger(claims.sv)
			) {
				return null;
			}

			const jtiHash = await hashSessionJti(claims.jti);
			const session = await this.repository.findSession(claims.sid, jtiHash);
			if (
				!session ||
				session.user_id !== claims.sub ||
				session.revoked_at !== null ||
				session.expires_at <= now ||
				session.session_version !== claims.sv ||
				session.session_user_version !== claims.sv ||
				session.is_blocked === 1 ||
				session.account_status !== 'active' ||
				session.email_verified_at === null
			) {
				return null;
			}

			await this.repository.touchSession(session.session_id, now);
			return {
				id: session.user_id,
				role: session.role,
				emailVerified: true,
				sessionId: session.session_id,
				sessionVersion: session.session_user_version,
				csrfHash: session.csrf_hash,
			};
		} catch {
			return null;
		}
	}
}

export function setSessionCookies(input: {
	cookies: Cookies;
	session: CreatedSession;
	environment: PortalEnvironment;
}): void {
	const secure = input.environment === 'preview' || input.environment === 'production';
	const maxAge = Math.max(
		0,
		Math.floor((Date.parse(input.session.expiresAt) - Date.now()) / 1000)
	);
	input.cookies.set(SESSION_COOKIE_NAME, input.session.sessionToken, {
		path: '/',
		httpOnly: true,
		secure,
		sameSite: 'lax',
		maxAge,
	});
	input.cookies.set(CSRF_COOKIE_NAME, input.session.csrfToken, {
		path: '/',
		httpOnly: false,
		secure,
		sameSite: 'lax',
		maxAge,
	});
}

export function clearSessionCookies(cookies: Cookies, environment: PortalEnvironment): void {
	const secure = environment === 'preview' || environment === 'production';
	cookies.delete(SESSION_COOKIE_NAME, { path: '/', secure, sameSite: 'lax' });
	cookies.delete(CSRF_COOKIE_NAME, { path: '/', secure, sameSite: 'lax' });
}
