import type { AuthenticatedUser } from '$lib/server/auth/session';

export class AuthorizationError extends Error {
	readonly code: 'AUTHENTICATION_REQUIRED' | 'FORBIDDEN' | 'CSRF_REJECTED';

	constructor(code: 'AUTHENTICATION_REQUIRED' | 'FORBIDDEN' | 'CSRF_REJECTED') {
		super('Authorization was denied.');
		this.name = 'AuthorizationError';
		this.code = code;
	}
}

declare const adminActorBrand: unique symbol;
declare const parentActorBrand: unique symbol;

export type AdminActor = AuthenticatedUser & {
	role: 'admin';
	readonly [adminActorBrand]: true;
};

export type ParentActor = AuthenticatedUser & {
	role: 'parent';
	readonly [parentActorBrand]: true;
};

export function requireAuthenticated(
	user: AuthenticatedUser | App.Locals['user'] | undefined
): AuthenticatedUser {
	if (!user) throw new AuthorizationError('AUTHENTICATION_REQUIRED');
	return user;
}

export function requireAdmin(user: AuthenticatedUser | App.Locals['user'] | undefined): AdminActor {
	const authenticated = requireAuthenticated(user);
	if (authenticated.role !== 'admin') throw new AuthorizationError('FORBIDDEN');
	return authenticated as AdminActor;
}

export function requireParent(
	user: AuthenticatedUser | App.Locals['user'] | undefined
): ParentActor {
	const authenticated = requireAuthenticated(user);
	if (authenticated.role !== 'parent') throw new AuthorizationError('FORBIDDEN');
	return authenticated as ParentActor;
}

export function requireObjectOwner(input: {
	actor: AuthenticatedUser | App.Locals['user'] | undefined;
	ownerUserId: string;
	allowAdmin?: boolean;
}): AuthenticatedUser {
	const actor = requireAuthenticated(input.actor);
	if (actor.id === input.ownerUserId) return actor;
	if (input.allowAdmin && actor.role === 'admin') return actor;
	throw new AuthorizationError('FORBIDDEN');
}
