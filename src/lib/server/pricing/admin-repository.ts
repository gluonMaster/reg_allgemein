import { DatabaseBoundary, type StatementSpec } from '$lib/server/db/database';
import { normalizeLookupText } from '$lib/server/import/canonical';
import { hashCanonical } from '$lib/server/import/canonical';
import { MISSING_PRICE_KEY, normalizePriceLookupKey, normalizeSubjectList } from './normalization';

export interface AuthenticatedAdminActor {
	id: string;
	role: 'admin';
}

export class PricingAdminError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'PricingAdminError';
	}
}

function assertAdmin(actor: AuthenticatedAdminActor): void {
	if (actor.role !== 'admin' || !actor.id.trim()) throw new PricingAdminError('ADMIN_REQUIRED');
}

function assertAdminEvidence(reason: string, responsibilityConfirmed: boolean): string {
	const normalized = reason.trim();
	if (!normalized) throw new PricingAdminError('ADMIN_REASON_REQUIRED');
	if (!responsibilityConfirmed) throw new PricingAdminError('ADMIN_CONFIRMATION_REQUIRED');
	return normalized;
}

function auditStatement(input: {
	actorUserId: string;
	action: string;
	targetKind: string;
	targetId: string;
	requestId: string;
	safeDiff: Record<string, unknown>;
	now: string;
}): StatementSpec {
	return {
		sql: `INSERT INTO audit_events
			(id, actor_user_id, actor_kind, action, target_kind, target_id,
			 request_id, safe_diff_json, ip_retention_value, created_at)
			VALUES (?, ?, 'user', ?, ?, ?, ?, ?, NULL, ?)`,
		params: [
			crypto.randomUUID(),
			input.actorUserId,
			input.action,
			input.targetKind,
			input.targetId,
			input.requestId,
			JSON.stringify(input.safeDiff),
			input.now,
		],
	};
}

export class CoursePricingAdminRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async confirmCourseMapping(input: {
		actor: AuthenticatedAdminActor;
		requestId: string;
		courseGroupId: string;
		sourceKind: 'access' | 'plusbtext' | 'schedule';
		sourceValue: string;
		reason: string;
		responsibilityConfirmed: boolean;
		now: string;
	}): Promise<string> {
		assertAdmin(input.actor);
		const reason = assertAdminEvidence(input.reason, input.responsibilityConfirmed);
		const sourceValueNormalized = normalizeLookupText(input.sourceValue);
		if (!sourceValueNormalized) throw new PricingAdminError('SOURCE_VALUE_REQUIRED');
		const course = await this.db.first<{
			academic_period_id: string;
			lesson_kind: string;
			catalog_status: string;
		}>({
			sql: `SELECT academic_period_id, lesson_kind, catalog_status
				FROM course_groups WHERE id = ?`,
			params: [input.courseGroupId],
		});
		if (!course) throw new PricingAdminError('COURSE_NOT_FOUND');
		if (course.lesson_kind === 'needs_review' || course.catalog_status === 'needs_review') {
			await this.createReviewTask({
				kind: 'course_classification',
				sourceKind: 'course_group',
				sourceId: input.courseGroupId,
				reasonCode: 'COURSE_PLACEHOLDER_OR_UNKNOWN',
				now: input.now,
			});
			throw new PricingAdminError('COURSE_CLASSIFICATION_REVIEW_REQUIRED');
		}

		const conflict = await this.db.first<{ course_group_id: string }>({
			sql: `SELECT course_group_id FROM course_source_mappings
				WHERE academic_period_id = ? AND source_kind = ?
					AND source_value_normalized = ? AND status = 'confirmed'
					AND course_group_id != ?`,
			params: [
				course.academic_period_id,
				input.sourceKind,
				sourceValueNormalized,
				input.courseGroupId,
			],
		});
		if (conflict) {
			await this.createReviewTask({
				kind: 'course_mapping',
				sourceKind: input.sourceKind,
				sourceId: input.courseGroupId,
				reasonCode: 'COURSE_MAPPING_CONFLICT',
				now: input.now,
			});
			throw new PricingAdminError('COURSE_MAPPING_CONFLICT');
		}

		const existing = await this.db.first<{ id: string }>({
			sql: `SELECT id FROM course_source_mappings
				WHERE academic_period_id = ? AND source_kind = ?
					AND source_value_normalized = ? AND course_group_id = ?`,
			params: [
				course.academic_period_id,
				input.sourceKind,
				sourceValueNormalized,
				input.courseGroupId,
			],
		});
		const mappingId = existing?.id ?? crypto.randomUUID();
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO course_source_mappings
					(id, academic_period_id, source_kind, source_value_normalized,
					 course_group_id, status, reason, created_by, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
					ON CONFLICT (academic_period_id, source_kind, source_value_normalized, course_group_id)
					DO UPDATE SET status = 'confirmed', reason = excluded.reason,
						created_by = excluded.created_by, updated_at = excluded.updated_at`,
				params: [
					mappingId,
					course.academic_period_id,
					input.sourceKind,
					sourceValueNormalized,
					input.courseGroupId,
					reason,
					input.actor.id,
					input.now,
					input.now,
				],
			},
			auditStatement({
				actorUserId: input.actor.id,
				action: 'course.mapping.confirmed',
				targetKind: 'course_source_mapping',
				targetId: mappingId,
				requestId: input.requestId,
				safeDiff: { sourceKind: input.sourceKind, courseGroupId: input.courseGroupId },
				now: input.now,
			}),
		];
		if (input.sourceKind === 'access') {
			statements.splice(1, 0, {
				sql: `UPDATE legacy_enrollments SET
					course_group_id = ?,
					is_active_for_occupancy = CASE
						WHEN is_current = 1
							AND lesson_kind IN ('group', 'dance_group')
							AND contract_kind IN ('yearly', 'monthly')
							AND upper(trim(coalesce(status_code_raw, ''))) <> 'KN'
							THEN 1 ELSE 0 END,
					updated_at = ?
					WHERE academic_period_id = ? AND group_name_normalized = ?`,
				params: [
					input.courseGroupId,
					input.now,
					course.academic_period_id,
					sourceValueNormalized,
				],
			});
		}
		await this.db.batch(statements);
		return mappingId;
	}

	async configureCoursePricing(input: {
		actor: AuthenticatedAdminActor;
		requestId: string;
		courseGroupId: string;
		contractKind: 'group_yearly' | 'group_monthly';
		priceKey?: string;
		subjects: readonly string[];
		durationSource: 'plusbtext' | 'schedule' | 'admin_confirmed';
		adminDurationMinutes?: number;
		reason: string;
		responsibilityConfirmed: boolean;
		now: string;
	}): Promise<{ profileId: string; version: number; status: 'confirmed' | 'needs_review' }> {
		assertAdmin(input.actor);
		const reason = assertAdminEvidence(input.reason, input.responsibilityConfirmed);
		const course = await this.db.first<{
			academic_period_id: string;
			display_name: string;
			lesson_kind: string;
		}>({
			sql: `SELECT academic_period_id, display_name, lesson_kind FROM course_groups WHERE id = ?`,
			params: [input.courseGroupId],
		});
		if (!course) throw new PricingAdminError('COURSE_NOT_FOUND');
		if (
			input.durationSource === 'admin_confirmed' &&
			(!Number.isSafeInteger(input.adminDurationMinutes) || input.adminDurationMinutes! <= 0)
		) {
			throw new PricingAdminError('ADMIN_DURATION_INVALID');
		}
		if (
			input.durationSource !== 'admin_confirmed' &&
			input.adminDurationMinutes !== undefined
		) {
			throw new PricingAdminError('ADMIN_DURATION_NOT_ALLOWED');
		}

		const priceKey = normalizePriceLookupKey(input.priceKey ?? course.display_name);
		const normalizedPriceKey =
			priceKey === MISSING_PRICE_KEY ? null : normalizeLookupText(priceKey);
		const plusBTextMappings =
			input.durationSource === 'plusbtext'
				? await this.db.all<{ id: string }>({
						sql: `SELECT id FROM course_source_mappings
							WHERE course_group_id = ? AND source_kind = 'plusbtext' AND status = 'confirmed'`,
						params: [input.courseGroupId],
					})
				: null;
		const status: 'confirmed' | 'needs_review' =
			(course.lesson_kind === 'group' || course.lesson_kind === 'dance_group') &&
			normalizedPriceKey &&
			(input.durationSource !== 'plusbtext' || plusBTextMappings?.results.length === 1)
				? 'confirmed'
				: 'needs_review';
		const existing = await this.db.first<{ id: string; version: number }>({
			sql: `SELECT id, version FROM course_pricing_profiles WHERE course_group_id = ?`,
			params: [input.courseGroupId],
		});
		const profileId = existing?.id ?? crypto.randomUUID();
		const version = (existing?.version ?? 0) + 1;
		const normalizedSubjects = normalizeSubjectList(input.subjects);
		const statements: StatementSpec[] = [
			{
				sql: `INSERT INTO course_pricing_profiles
					(id, course_group_id, contract_kind, price_key, normalized_price_key,
					 subjects_json, duration_source, admin_duration_minutes, status, version,
					 reason, confirmed_by, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT (course_group_id) DO UPDATE SET
						contract_kind = excluded.contract_kind,
						price_key = excluded.price_key,
						normalized_price_key = excluded.normalized_price_key,
						subjects_json = excluded.subjects_json,
						duration_source = excluded.duration_source,
						admin_duration_minutes = excluded.admin_duration_minutes,
						status = excluded.status,
						version = excluded.version,
						reason = excluded.reason,
						confirmed_by = excluded.confirmed_by,
						updated_at = excluded.updated_at`,
				params: [
					profileId,
					input.courseGroupId,
					input.contractKind,
					priceKey,
					normalizedPriceKey ?? MISSING_PRICE_KEY,
					JSON.stringify(normalizedSubjects),
					input.durationSource,
					input.adminDurationMinutes ?? null,
					status,
					version,
					reason,
					input.actor.id,
					input.now,
					input.now,
				],
			},
			{
				sql: `UPDATE course_groups SET normalized_price_key = ?, updated_at = ? WHERE id = ?`,
				params: [normalizedPriceKey, input.now, input.courseGroupId],
			},
			auditStatement({
				actorUserId: input.actor.id,
				action: 'course.pricing_profile.configured',
				targetKind: 'course_pricing_profile',
				targetId: profileId,
				requestId: input.requestId,
				safeDiff: {
					courseGroupId: input.courseGroupId,
					contractKind: input.contractKind,
					durationSource: input.durationSource,
					status,
					version,
				},
				now: input.now,
			}),
		];
		await this.db.batch(statements);
		if (status === 'needs_review') {
			await this.createReviewTask({
				kind: 'pricing_context',
				sourceKind: 'course_group',
				sourceId: input.courseGroupId,
				reasonCode: !normalizedPriceKey
					? 'MISSING_PRICE_KEY'
					: 'PRICING_PROFILE_MAPPING_REQUIRED',
				now: input.now,
			});
		}
		return { profileId, version, status };
	}

	async ensureMappingReviewTasks(academicPeriodId: string, now: string): Promise<number> {
		const rows = await this.db.all<{ id: string; kind: string; reason_code: string }>({
			sql: `SELECT course.id, 'course_classification' AS kind,
					'COURSE_PLACEHOLDER_OR_UNKNOWN' AS reason_code
				FROM course_groups AS course
				WHERE course.academic_period_id = ?
					AND (course.lesson_kind = 'needs_review' OR course.catalog_status = 'needs_review')
				UNION ALL
				SELECT legacy.id, 'course_mapping' AS kind, 'COURSE_MAPPING_REQUIRED' AS reason_code
				FROM legacy_enrollments AS legacy
				WHERE legacy.academic_period_id = ? AND legacy.is_current = 1
					AND legacy.course_group_id IS NULL
					AND legacy.lesson_kind IN ('group', 'dance_group')`,
			params: [academicPeriodId, academicPeriodId],
		});
		let created = 0;
		for (const row of rows.results) {
			created += await this.createReviewTask({
				kind: row.kind,
				sourceKind: row.kind === 'course_mapping' ? 'legacy_enrollment' : 'course_group',
				sourceId: row.id,
				reasonCode: row.reason_code,
				now,
			});
		}
		return created;
	}

	async confirmEstimatedQuote(input: {
		actor: AuthenticatedAdminActor;
		requestId: string;
		idempotencyKey: string;
		quoteId: string;
		confirmedDurationMinutes: number;
		confirmedPriceCents: number;
		reason: string;
		responsibilityConfirmed: boolean;
		now: string;
	}): Promise<void> {
		assertAdmin(input.actor);
		const reason = assertAdminEvidence(input.reason, input.responsibilityConfirmed);
		if (
			!Number.isSafeInteger(input.confirmedDurationMinutes) ||
			input.confirmedDurationMinutes <= 0 ||
			!Number.isSafeInteger(input.confirmedPriceCents) ||
			input.confirmedPriceCents < 0
		) {
			throw new PricingAdminError('QUOTE_CONFIRMATION_VALUES_INVALID');
		}
		if (!input.idempotencyKey.trim()) throw new PricingAdminError('IDEMPOTENCY_KEY_REQUIRED');
		const duplicate = await this.db.first<{
			id: string;
			confirmed_duration_minutes: number;
			confirmed_price_cents: number;
			confirmation_reason: string;
		}>({
			sql: `SELECT id, confirmed_duration_minutes, confirmed_price_cents, confirmation_reason
				FROM price_quotes WHERE confirmation_idempotency_key = ?`,
			params: [input.idempotencyKey],
		});
		if (duplicate) {
			if (
				duplicate.id !== input.quoteId ||
				duplicate.confirmed_duration_minutes !== input.confirmedDurationMinutes ||
				duplicate.confirmed_price_cents !== input.confirmedPriceCents ||
				duplicate.confirmation_reason !== reason
			) {
				throw new PricingAdminError('IDEMPOTENCY_KEY_REUSED');
			}
			return;
		}
		const quote = await this.db.first<{
			decision_code: string;
			status: string;
			expires_at: string;
		}>({
			sql: `SELECT decision_code, status, expires_at FROM price_quotes WHERE id = ?`,
			params: [input.quoteId],
		});
		if (!quote) throw new PricingAdminError('QUOTE_NOT_FOUND');
		if (
			quote.decision_code !== 'ESTIMATED_MISSING_DURATION' ||
			quote.status !== 'needs_admin_confirmation'
		) {
			throw new PricingAdminError('QUOTE_NOT_CONFIRMABLE');
		}
		if (quote.expires_at <= input.now) throw new PricingAdminError('QUOTE_EXPIRED');
		const results = await this.db.batch([
			{
				sql: `UPDATE price_quotes SET
					confirmed_duration_minutes = ?, confirmed_price_cents = ?,
					confirmed_by_admin_user_id = ?, confirmed_at = ?, confirmation_reason = ?,
					confirmation_json = ?, confirmation_idempotency_key = ?, status = 'confirmed'
					WHERE id = ? AND decision_code = 'ESTIMATED_MISSING_DURATION'
						AND status = 'needs_admin_confirmation' AND expires_at > ?`,
				params: [
					input.confirmedDurationMinutes,
					input.confirmedPriceCents,
					input.actor.id,
					input.now,
					reason,
					JSON.stringify({
						schemaVersion: 1,
						confirmedDurationMinutes: input.confirmedDurationMinutes,
						confirmedPriceCents: input.confirmedPriceCents,
					}),
					input.idempotencyKey,
					input.quoteId,
					input.now,
				],
			},
			{
				sql: `INSERT INTO audit_events
					(id, actor_user_id, actor_kind, action, target_kind, target_id,
					 request_id, safe_diff_json, ip_retention_value, created_at)
					SELECT ?, ?, 'user', 'price_quote.missing_duration.confirmed',
						'price_quote', ?, ?, ?, NULL, ?
					WHERE EXISTS (
						SELECT 1 FROM price_quotes
						WHERE id = ? AND confirmation_idempotency_key = ? AND status = 'confirmed'
					)`,
				params: [
					crypto.randomUUID(),
					input.actor.id,
					input.quoteId,
					input.requestId,
					JSON.stringify({
						confirmedDurationMinutes: input.confirmedDurationMinutes,
						confirmedPriceCents: input.confirmedPriceCents,
					}),
					input.now,
					input.quoteId,
					input.idempotencyKey,
				],
			},
		]);
		if ((results[0].meta.changes ?? 0) !== 1) {
			throw new PricingAdminError('QUOTE_CONFIRMATION_RACE');
		}
	}

	private async createReviewTask(input: {
		kind: string;
		sourceKind: string;
		sourceId: string;
		reasonCode: string;
		now: string;
	}): Promise<number> {
		const result = await this.db.run({
			sql: `INSERT OR IGNORE INTO admin_review_tasks
				(id, kind, source_kind, source_id, reason_code, safe_summary, status,
				 assigned_to, resolution, created_at, updated_at, resolved_at)
				VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, ?, NULL)`,
			params: [
				crypto.randomUUID(),
				input.kind,
				input.sourceKind,
				input.sourceId,
				input.reasonCode,
				JSON.stringify({ reasonCode: input.reasonCode }),
				input.now,
				input.now,
			],
		});
		return result.meta.changes ?? 0;
	}

	async applyManualOverride(input: {
		actor: AuthenticatedAdminActor;
		requestId: string;
		idempotencyKey: string;
		enrollmentId: string;
		basePriceCents: number;
		overridePriceCents: number;
		priceVersionId: string;
		priceRuleId: string | null;
		priceSource: 'excel_yearly' | 'excel_monthly';
		contractKind: 'group_yearly' | 'group_monthly';
		reason: string;
		responsibilityConfirmed: boolean;
		now: string;
	}): Promise<string> {
		assertAdmin(input.actor);
		const reason = assertAdminEvidence(input.reason, input.responsibilityConfirmed);
		for (const amount of [input.basePriceCents, input.overridePriceCents]) {
			if (!Number.isSafeInteger(amount) || amount < 0) {
				throw new PricingAdminError('MANUAL_OVERRIDE_AMOUNT_INVALID');
			}
		}
		if (!input.idempotencyKey.trim()) throw new PricingAdminError('IDEMPOTENCY_KEY_REQUIRED');
		const requestHash = await hashCanonical({
			enrollmentId: input.enrollmentId,
			basePriceCents: input.basePriceCents,
			overridePriceCents: input.overridePriceCents,
			priceVersionId: input.priceVersionId,
			priceRuleId: input.priceRuleId,
			priceSource: input.priceSource,
			contractKind: input.contractKind,
			reason,
		});
		const previous = await this.db.first<{ id: string; request_hash_sha256: string }>({
			sql: `SELECT id, request_hash_sha256 FROM price_manual_overrides WHERE idempotency_key = ?`,
			params: [input.idempotencyKey],
		});
		if (previous) {
			if (previous.request_hash_sha256 !== requestHash) {
				throw new PricingAdminError('IDEMPOTENCY_KEY_REUSED');
			}
			return previous.id;
		}
		const enrollment = await this.db.first<{
			id: string;
			contract_kind: string;
			rule_price_version_id: string | null;
			yearly_price_cents: number | null;
			monthly_price_cents: number | null;
		}>({
			sql: `SELECT enrollment.id, enrollment.contract_kind,
				rule.price_version_id AS rule_price_version_id,
				rule.yearly_price_cents, rule.monthly_price_cents
				FROM enrollments AS enrollment
				LEFT JOIN course_pricing_profiles AS profile
					ON profile.course_group_id = enrollment.course_group_id
					AND profile.status = 'confirmed'
				LEFT JOIN price_rules AS rule
					ON rule.id = ? AND rule.price_version_id = ? AND rule.is_valid = 1
					AND rule.normalized_key = profile.normalized_price_key
				WHERE enrollment.id = ?`,
			params: [input.priceRuleId, input.priceVersionId, input.enrollmentId],
		});
		if (!enrollment || enrollment.contract_kind !== input.contractKind) {
			throw new PricingAdminError('ENROLLMENT_CONTEXT_MISMATCH');
		}
		const yearly = input.contractKind === 'group_yearly';
		const expectedSource = yearly ? 'excel_yearly' : 'excel_monthly';
		const expectedBase = yearly
			? enrollment.yearly_price_cents
			: enrollment.monthly_price_cents;
		if (
			!input.priceRuleId ||
			enrollment.rule_price_version_id !== input.priceVersionId ||
			input.priceSource !== expectedSource ||
			expectedBase !== input.basePriceCents
		) {
			throw new PricingAdminError('MANUAL_OVERRIDE_BASE_MISMATCH');
		}
		const overrideId = crypto.randomUUID();
		await this.db.batch([
			{
				sql: `INSERT INTO price_manual_overrides
					(id, enrollment_id, base_price_cents, override_price_cents,
					 price_version_id, price_rule_id, price_source, contract_kind, reason,
					 actor_user_id, responsibility_confirmed, request_hash_sha256,
					 idempotency_key, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
				params: [
					overrideId,
					input.enrollmentId,
					input.basePriceCents,
					input.overridePriceCents,
					input.priceVersionId,
					input.priceRuleId,
					input.priceSource,
					input.contractKind,
					reason,
					input.actor.id,
					requestHash,
					input.idempotencyKey,
					input.now,
				],
			},
			{
				sql: `UPDATE enrollments SET current_price_cents = ?, price_source = ?,
					price_mode = 'manual_override', price_effective_from = ?,
					manual_override_reason = ?, manual_override_by = ?, manual_override_at = ?,
					updated_at = ? WHERE id = ?`,
				params: [
					input.overridePriceCents,
					input.priceSource,
					input.now.slice(0, 10),
					reason,
					input.actor.id,
					input.now,
					input.now,
					input.enrollmentId,
				],
			},
			auditStatement({
				actorUserId: input.actor.id,
				action: 'enrollment.price.manual_override',
				targetKind: 'enrollment',
				targetId: input.enrollmentId,
				requestId: input.requestId,
				safeDiff: {
					basePriceCents: input.basePriceCents,
					overridePriceCents: input.overridePriceCents,
					deltaCents: input.overridePriceCents - input.basePriceCents,
					priceVersionId: input.priceVersionId,
					priceRuleId: input.priceRuleId,
				},
				now: input.now,
			}),
		]);
		return overrideId;
	}
}
