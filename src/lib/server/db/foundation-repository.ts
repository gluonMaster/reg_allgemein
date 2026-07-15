import { DatabaseBoundary } from './database';
import { isSha256Hex, scopedHash } from '$lib/server/security/digest';

export class FoundationStorageError extends Error {
	readonly code: string;

	constructor(code: string, cause?: unknown) {
		super('Foundation storage operation failed.', { cause });
		this.name = 'FoundationStorageError';
		this.code = code;
	}
}

export type IdempotencyReservation =
	| { outcome: 'acquired' }
	| { outcome: 'replay'; resultRef: string }
	| { outcome: 'in_progress' }
	| { outcome: 'conflict' };

interface IdempotencyRow {
	request_hash: string;
	result_ref: string | null;
	status: 'in_progress' | 'completed' | 'failed';
	expires_at: string;
}

interface LeaseRow {
	fencing_token: number;
	lease_until: string;
}

function assertInstant(value: string, field: string): void {
	if (!Number.isFinite(Date.parse(value))) {
		throw new TypeError(`${field} must be an ISO-8601 timestamp.`);
	}
}

function assertHash(value: string, field: string): void {
	if (!isSha256Hex(value)) throw new TypeError(`${field} must be a SHA-256 hex digest.`);
}

export async function hashIdempotencyKey(scope: string, rawKey: string): Promise<string> {
	return scopedHash(`idempotency-key:${scope}`, rawKey);
}

export async function hashRequestFingerprint(
	scope: string,
	canonicalRequest: string
): Promise<string> {
	return scopedHash(`idempotency-request:${scope}`, canonicalRequest);
}

export class FoundationRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async reserveIdempotency(input: {
		scope: string;
		keyHash: string;
		requestHash: string;
		now: string;
		expiresAt: string;
	}): Promise<IdempotencyReservation> {
		assertHash(input.keyHash, 'keyHash');
		assertHash(input.requestHash, 'requestHash');
		assertInstant(input.now, 'now');
		assertInstant(input.expiresAt, 'expiresAt');

		try {
			const inserted = await this.db.run({
				sql: `INSERT OR IGNORE INTO idempotency_records
					(id, scope, key_hash, request_hash, result_ref, status, expires_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, NULL, 'in_progress', ?, ?, ?)`,
				params: [
					crypto.randomUUID(),
					input.scope,
					input.keyHash,
					input.requestHash,
					input.expiresAt,
					input.now,
					input.now,
				],
			});

			if (inserted.meta.changes === 1) return { outcome: 'acquired' };

			const reclaimed = await this.db.run({
				sql: `UPDATE idempotency_records
					SET request_hash = ?, result_ref = NULL, status = 'in_progress',
						expires_at = ?, updated_at = ?
					WHERE scope = ? AND key_hash = ? AND expires_at <= ?`,
				params: [
					input.requestHash,
					input.expiresAt,
					input.now,
					input.scope,
					input.keyHash,
					input.now,
				],
			});

			if (reclaimed.meta.changes === 1) return { outcome: 'acquired' };

			const existing = await this.db.first<IdempotencyRow>({
				sql: `SELECT request_hash, result_ref, status, expires_at
					FROM idempotency_records WHERE scope = ? AND key_hash = ?`,
				params: [input.scope, input.keyHash],
			});

			if (!existing) throw new FoundationStorageError('IDEMPOTENCY_READ_AFTER_WRITE_MISSING');
			if (existing.request_hash !== input.requestHash) return { outcome: 'conflict' };
			if (existing.status === 'completed' && existing.result_ref) {
				return { outcome: 'replay', resultRef: existing.result_ref };
			}

			return { outcome: 'in_progress' };
		} catch (cause) {
			if (cause instanceof FoundationStorageError) throw cause;
			throw new FoundationStorageError('IDEMPOTENCY_STORAGE_UNAVAILABLE', cause);
		}
	}

	async completeIdempotency(input: {
		scope: string;
		keyHash: string;
		requestHash: string;
		resultRef: string;
		now: string;
	}): Promise<boolean> {
		assertHash(input.keyHash, 'keyHash');
		assertHash(input.requestHash, 'requestHash');
		assertInstant(input.now, 'now');

		try {
			const result = await this.db.run({
				sql: `UPDATE idempotency_records
					SET status = 'completed', result_ref = ?, updated_at = ?
					WHERE scope = ? AND key_hash = ? AND request_hash = ? AND status = 'in_progress'`,
				params: [input.resultRef, input.now, input.scope, input.keyHash, input.requestHash],
			});

			return result.meta.changes === 1;
		} catch (cause) {
			throw new FoundationStorageError('IDEMPOTENCY_STORAGE_UNAVAILABLE', cause);
		}
	}

	async consumeRateLimit(input: {
		scope: string;
		subjectHash: string;
		windowStart: string;
		expiresAt: string;
		now: string;
		limit: number;
	}): Promise<{ allowed: boolean; count: number }> {
		assertHash(input.subjectHash, 'subjectHash');
		assertInstant(input.windowStart, 'windowStart');
		assertInstant(input.expiresAt, 'expiresAt');
		assertInstant(input.now, 'now');
		if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
			throw new TypeError('limit must be a positive integer.');
		}

		try {
			const row = await this.db.first<{ count: number }>({
				sql: `INSERT INTO rate_limit_buckets
					(id, scope, subject_hash, window_start, count, expires_at, created_at, updated_at)
					VALUES (?, ?, ?, ?, 1, ?, ?, ?)
					ON CONFLICT(scope, subject_hash, window_start) DO UPDATE SET
						count = rate_limit_buckets.count + 1,
						expires_at = excluded.expires_at,
						updated_at = excluded.updated_at
					RETURNING count`,
				params: [
					crypto.randomUUID(),
					input.scope,
					input.subjectHash,
					input.windowStart,
					input.expiresAt,
					input.now,
					input.now,
				],
			});

			if (!row) throw new FoundationStorageError('RATE_LIMIT_RESULT_MISSING');
			return { allowed: row.count <= input.limit, count: row.count };
		} catch (cause) {
			if (cause instanceof FoundationStorageError) throw cause;
			throw new FoundationStorageError('RATE_LIMIT_STORAGE_UNAVAILABLE', cause);
		}
	}

	async tryAcquireLease(input: {
		scope: string;
		resourceKey: string;
		owner: string;
		now: string;
		leaseUntil: string;
	}): Promise<
		{ acquired: false } | { acquired: true; fencingToken: number; leaseUntil: string }
	> {
		assertInstant(input.now, 'now');
		assertInstant(input.leaseUntil, 'leaseUntil');
		if (input.leaseUntil <= input.now) throw new TypeError('leaseUntil must be after now.');

		try {
			const row = await this.db.first<LeaseRow>({
				sql: `INSERT INTO operation_locks
					(id, scope, resource_key, lease_owner, lease_until, fencing_token, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, 1, ?, ?)
					ON CONFLICT(scope, resource_key) DO UPDATE SET
						lease_owner = excluded.lease_owner,
						lease_until = excluded.lease_until,
						fencing_token = operation_locks.fencing_token + 1,
						updated_at = excluded.updated_at
					WHERE operation_locks.lease_until <= ?
					RETURNING fencing_token, lease_until`,
				params: [
					crypto.randomUUID(),
					input.scope,
					input.resourceKey,
					input.owner,
					input.leaseUntil,
					input.now,
					input.now,
					input.now,
				],
			});

			return row
				? { acquired: true, fencingToken: row.fencing_token, leaseUntil: row.lease_until }
				: { acquired: false };
		} catch (cause) {
			throw new FoundationStorageError('LEASE_STORAGE_UNAVAILABLE', cause);
		}
	}

	async releaseLease(input: {
		scope: string;
		resourceKey: string;
		owner: string;
		fencingToken: number;
		now: string;
	}): Promise<boolean> {
		assertInstant(input.now, 'now');
		if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) {
			throw new TypeError('fencingToken must be a positive integer.');
		}

		try {
			const result = await this.db.run({
				sql: `UPDATE operation_locks
					SET lease_until = ?, updated_at = ?
					WHERE scope = ? AND resource_key = ? AND lease_owner = ?
						AND fencing_token = ? AND lease_until > ?`,
				params: [
					input.now,
					input.now,
					input.scope,
					input.resourceKey,
					input.owner,
					input.fencingToken,
					input.now,
				],
			});

			return result.meta.changes === 1;
		} catch (cause) {
			throw new FoundationStorageError('LEASE_STORAGE_UNAVAILABLE', cause);
		}
	}
}
