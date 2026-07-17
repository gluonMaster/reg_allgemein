import { compare, hash } from 'bcryptjs';

const BCRYPT_MAX_BYTES = 72;

export class PasswordPolicyError extends Error {
	readonly code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG';

	constructor(code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG') {
		super('Password does not satisfy the configured policy.');
		this.name = 'PasswordPolicyError';
		this.code = code;
	}
}

export interface PasswordHasher {
	hash(password: string): Promise<string>;
	verify(password: string, passwordHash: string): Promise<boolean>;
	verifyAgainstDummy(password: string): Promise<void>;
}

export class BcryptPasswordHasher implements PasswordHasher {
	private dummyHash?: Promise<string>;

	constructor(
		private readonly minimumLength: number,
		private readonly maximumLength: number,
		private readonly rounds = 12
	) {}

	private assertPolicy(password: string): void {
		if (password.length < this.minimumLength) throw new PasswordPolicyError('PASSWORD_TOO_SHORT');
		if (
			password.length > this.maximumLength ||
			new TextEncoder().encode(password).byteLength > BCRYPT_MAX_BYTES
		) {
			throw new PasswordPolicyError('PASSWORD_TOO_LONG');
		}
	}

	async hash(password: string): Promise<string> {
		this.assertPolicy(password);
		return hash(password, this.rounds);
	}

	async verify(password: string, passwordHash: string): Promise<boolean> {
		if (
			password.length > this.maximumLength ||
			new TextEncoder().encode(password).byteLength > BCRYPT_MAX_BYTES
		) {
			return false;
		}
		return compare(password, passwordHash);
	}

	async verifyAgainstDummy(password: string): Promise<void> {
		this.dummyHash ??= hash(crypto.randomUUID(), this.rounds);
		await compare(password.slice(0, this.maximumLength), await this.dummyHash);
	}
}
