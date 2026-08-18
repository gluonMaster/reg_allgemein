import { DatabaseBoundary } from '$lib/server/db/database';
import { maskLegacyEmail } from '$lib/server/family/verification-extension';
import { redactSensitive } from '$lib/server/observability/redaction';
import type { AdminListQuery } from './contracts';

const PAGE_SIZE = 20;
const SENSITIVE_CONTEXT_KEY = /(path|directory|workstation|username|source_label)/i;

function safeJson(value: string): unknown {
	try {
		return sanitizeAdminContext(redactSensitive(JSON.parse(value)));
	} catch {
		return {};
	}
}

function safeLegacyFamilyReference(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const context = value as Record<string, unknown>;
	return context.entityType === 'legacy_family' &&
		typeof context.entityId === 'string' &&
		/^legacy_family_[a-f0-9]{32}$/u.test(context.entityId)
		? context.entityId
		: null;
}

function sanitizeAdminContext(value: unknown, depth = 0): unknown {
	if (depth > 8) return '[TRUNCATED]';
	if (typeof value === 'string') {
		if (/^(?:[A-Za-z]:\\|\\\\|\/home\/|\/Users\/)/.test(value)) return '[REDACTED]';
		return value.slice(0, 500);
	}
	if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value))
		return value.slice(0, 50).map((item) => sanitizeAdminContext(item, depth + 1));
	if (typeof value !== 'object') return String(value);
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.slice(0, 100)
			.map(([key, item]) => [
				key,
				SENSITIVE_CONTEXT_KEY.test(key)
					? '[REDACTED]'
					: sanitizeAdminContext(item, depth + 1),
			])
	);
}

function pageOffset(page: number): number {
	return (page - 1) * PAGE_SIZE;
}

function paged<T>(rows: readonly T[], page: number) {
	return {
		items: rows.slice(0, PAGE_SIZE),
		page,
		hasNext: rows.length > PAGE_SIZE,
	};
}

export class AdminConsoleRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async dashboard() {
		const [reviews, issues, blocked, catalog] = await Promise.all([
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM admin_review_tasks
					WHERE status IN ('open', 'in_progress')`,
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM import_issues WHERE status = 'open'`,
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM users
					WHERE is_blocked = 1 AND account_status = 'active'`,
			}),
			this.db.first<{ count: number }>({
				sql: `SELECT COUNT(*) AS count FROM course_groups
					WHERE catalog_status = 'needs_review'`,
			}),
		]);
		return {
			openReviews: reviews?.count ?? 0,
			openImportIssues: issues?.count ?? 0,
			blockedUsers: blocked?.count ?? 0,
			catalogNeedsReview: catalog?.count ?? 0,
		};
	}

	async listImportRuns(query: AdminListQuery) {
		const rows = await this.db.all<{
			id: string;
			source_kind: string;
			academic_period: string;
			status: string;
			attempt_no: number;
			started_at: string;
			finished_at: string | null;
			rows_total: number;
			rows_promoted: number;
			rows_skipped: number;
			error_code: string | null;
			open_issue_count: number;
		}>({
			sql: `SELECT run.id, run.source_kind, period.code AS academic_period,
				run.status, run.attempt_no, run.started_at, run.finished_at,
				run.rows_total, run.rows_promoted, run.rows_skipped, run.error_code,
				(SELECT COUNT(*) FROM import_issues issue
					WHERE issue.import_run_id = run.id AND issue.status = 'open') AS open_issue_count
			FROM import_runs run
			JOIN academic_periods period ON period.id = run.academic_period_id
			WHERE (? = '' OR run.status = ?)
				AND (? = '' OR run.source_kind = ?)
				AND (? = '' OR run.id = ? OR period.code LIKE ?)
			ORDER BY run.started_at DESC, run.id DESC
			LIMIT ? OFFSET ?`,
			params: [
				query.status,
				query.status,
				query.kind,
				query.kind,
				query.q,
				query.q,
				`%${query.q}%`,
				PAGE_SIZE + 1,
				pageOffset(query.page),
			],
		});
		return paged(rows.results, query.page);
	}

	async importRunDetail(runId: string) {
		const run = await this.db.first<{
			id: string;
			source_kind: string;
			academic_period: string;
			status: string;
			attempt_no: number;
			started_at: string;
			validated_at: string | null;
			promoted_at: string | null;
			finished_at: string | null;
			rows_total: number;
			rows_staged: number;
			rows_promoted: number;
			rows_skipped: number;
			safe_summary_json: string;
			error_code: string | null;
		}>({
			sql: `SELECT run.id, run.source_kind, period.code AS academic_period,
				run.status, run.attempt_no, run.started_at, run.validated_at,
				run.promoted_at, run.finished_at, run.rows_total, run.rows_staged,
				run.rows_promoted, run.rows_skipped, run.safe_summary_json, run.error_code
			FROM import_runs run
			JOIN academic_periods period ON period.id = run.academic_period_id
			WHERE run.id = ?`,
			params: [runId],
		});
		if (!run) return null;
		const issues = await this.db.all<{
			id: string;
			severity: string;
			code: string;
			source_record_key: string | null;
			safe_context_json: string;
			status: string;
			created_at: string;
			reconciliation_case_id: string | null;
		}>({
			sql: `SELECT issue.id, issue.severity, issue.code, issue.source_record_key,
				issue.safe_context_json, issue.status, issue.created_at,
				(SELECT occurrence.case_id FROM legacy_reconciliation_occurrences AS occurrence
					WHERE occurrence.import_issue_id = issue.id LIMIT 1) AS reconciliation_case_id
				FROM import_issues AS issue
			WHERE import_run_id = ? ORDER BY status, severity DESC, code, id LIMIT 200`,
			params: [runId],
		});
		const { safe_summary_json, ...safeRun } = run;
		return {
			...safeRun,
			safeSummary: safeJson(safe_summary_json),
			issues: issues.results.map(({ safe_context_json, ...issue }) => {
				const safeContext = safeJson(safe_context_json);
				return {
					...issue,
					safeContext,
					legacyFamilyId: safeLegacyFamilyReference(safeContext),
				};
			}),
		};
	}

	async listReviews(query: AdminListQuery) {
		const rows = await this.db.all<{
			id: string;
			kind: string;
			source_kind: string;
			source_id: string;
			reason_code: string;
			safe_summary: string;
			status: string;
			assigned_to: string | null;
			created_at: string;
			resolved_at: string | null;
		}>({
			sql: `SELECT id, kind, source_kind, source_id, reason_code, safe_summary,
				status, assigned_to, created_at, resolved_at
			FROM admin_review_tasks
			WHERE (? = '' OR status = ?) AND (? = '' OR kind = ?)
				AND (? = '' OR id = ? OR source_id = ? OR reason_code LIKE ?)
			ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
				created_at, id
			LIMIT ? OFFSET ?`,
			params: [
				query.status,
				query.status,
				query.kind,
				query.kind,
				query.q,
				query.q,
				query.q,
				`%${query.q}%`,
				PAGE_SIZE + 1,
				pageOffset(query.page),
			],
		});
		return paged(
			rows.results.map((row) => ({
				...row,
				safe_summary: sanitizeAdminContext(row.safe_summary),
			})),
			query.page
		);
	}

	async listLegacyFamilies(query: AdminListQuery) {
		const normalized = query.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			allocation_id: string;
			display_family_id: string;
			numbering_status: string;
			continuity_status: string;
			claimed_by_user_id: string | null;
			child_count: number;
			emails: string | null;
		}>({
			sql: `SELECT family.id, allocation.id AS allocation_id,
				allocation.display_family_id, family.numbering_status,
				family.continuity_status, family.claimed_by_user_id,
				(SELECT COUNT(*) FROM children child
					WHERE child.legacy_family_id = family.id AND child.is_current = 1) AS child_count,
				(SELECT group_concat(email.email_normalized, char(31))
					FROM legacy_family_emails email
					WHERE email.legacy_family_id = family.id AND email.is_current = 1
						AND email.email_normalized IS NOT NULL) AS emails
			FROM legacy_families family
			JOIN family_number_allocations allocation ON allocation.id = family.family_number_id
			LEFT JOIN legacy_family_periods family_period
				ON family_period.legacy_family_id = family.id AND family_period.is_current = 1
			WHERE (? = '' OR lower(allocation.display_family_id) LIKE ?
				OR lower(coalesce(family_period.parent_name_raw, '')) LIKE ?
				OR EXISTS (SELECT 1 FROM legacy_family_emails searched_email
					WHERE searched_email.legacy_family_id = family.id
						AND searched_email.is_current = 1
						AND searched_email.email_normalized = ?))
			ORDER BY allocation.sequence_number DESC
			LIMIT ? OFFSET ?`,
			params: [
				normalized,
				`%${normalized}%`,
				`%${normalized}%`,
				normalized,
				PAGE_SIZE + 1,
				pageOffset(query.page),
			],
		});
		return paged(
			rows.results.map(({ emails, ...row }) => ({
				...row,
				maskedEmails: (emails ?? '')
					.split(String.fromCharCode(31))
					.filter(Boolean)
					.slice(0, 3)
					.map(maskLegacyEmail),
				ownership: row.claimed_by_user_id ? 'owned' : 'unowned',
			})),
			query.page
		);
	}

	async legacyFamilyDetail(familyId: string) {
		const family = await this.db.first<{
			id: string;
			allocation_id: string;
			display_family_id: string;
			numbering_status: string;
			continuity_status: string;
			claimed_by_user_id: string | null;
			parent_name_raw: string | null;
			address_raw: string | null;
			phone_raw: string | null;
			mobile_raw: string | null;
		}>({
			sql: `SELECT family.id, allocation.id AS allocation_id,
				allocation.display_family_id, family.numbering_status,
				family.continuity_status, family.claimed_by_user_id,
				period.parent_name_raw, period.address_raw, period.phone_raw, period.mobile_raw
			FROM legacy_families family
			JOIN family_number_allocations allocation ON allocation.id = family.family_number_id
			LEFT JOIN legacy_family_periods period
				ON period.legacy_family_id = family.id AND period.is_current = 1
			WHERE family.id = ?`,
			params: [familyId],
		});
		if (!family) return null;
		const [emails, children, activities] = await Promise.all([
			this.db.all<{ email_raw: string }>({
				sql: `SELECT email_raw FROM legacy_family_emails
					WHERE legacy_family_id = ? AND is_current = 1 ORDER BY id LIMIT 20`,
				params: [familyId],
			}),
			this.db.all<{
				id: string;
				full_name: string;
				birth_date: string;
				owner_user_id: string | null;
			}>({
				sql: `SELECT id, full_name, birth_date, owner_user_id FROM children
					WHERE legacy_family_id = ? AND is_current = 1 ORDER BY full_name, id LIMIT 100`,
				params: [familyId],
			}),
			this.db.all<{
				id: string;
				group_name_raw: string;
				lesson_kind: string | null;
				needs_admin_review: number;
			}>({
				sql: `SELECT id, group_name_raw, lesson_kind, needs_admin_review
					FROM legacy_enrollments WHERE legacy_family_id = ? AND is_current = 1
					ORDER BY group_name_raw, id LIMIT 100`,
				params: [familyId],
			}),
		]);
		return {
			...family,
			emails: emails.results,
			children: children.results,
			activities: activities.results,
		};
	}

	async listUsers(query: AdminListQuery) {
		const normalized = query.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			email_normalized: string;
			first_name: string;
			last_name: string;
			role: string;
			is_blocked: number;
			account_status: string;
			family_display_id: string | null;
			child_count: number;
		}>({
			sql: `SELECT user.id, user.email_normalized, user.first_name, user.last_name,
				user.role, user.is_blocked, user.account_status,
				allocation.display_family_id AS family_display_id,
				(SELECT COUNT(*) FROM children child WHERE child.owner_user_id = user.id) AS child_count
			FROM users user
			LEFT JOIN family_number_allocations allocation ON allocation.id = user.family_number_id
			WHERE (? = '' OR user.account_status = ?)
				AND (? = '' OR user.email_normalized = ?
					OR user.first_name_normalized LIKE ? OR user.last_name_normalized LIKE ?
					OR lower(coalesce(allocation.display_family_id, '')) LIKE ?)
			ORDER BY user.last_name_normalized, user.first_name_normalized, user.id
			LIMIT ? OFFSET ?`,
			params: [
				query.status,
				query.status,
				normalized,
				normalized,
				`%${normalized}%`,
				`%${normalized}%`,
				`%${normalized}%`,
				PAGE_SIZE + 1,
				pageOffset(query.page),
			],
		});
		return paged(
			rows.results.map(({ email_normalized, ...row }) => ({
				...row,
				maskedEmail: maskLegacyEmail(email_normalized),
			})),
			query.page
		);
	}

	async userDetail(userId: string) {
		const user = await this.db.first<{
			id: string;
			email: string;
			first_name: string;
			last_name: string;
			phone: string | null;
			role: string;
			is_blocked: number;
			account_status: string;
			email_verified_at: string | null;
			family_number_id: string | null;
			family_display_id: string | null;
			family_version: number;
		}>({
			sql: `SELECT user.id, user.email, user.first_name, user.last_name, user.phone,
				user.role, user.is_blocked, user.account_status, user.email_verified_at,
				user.family_number_id, allocation.display_family_id AS family_display_id,
				user.family_version
			FROM users user
			LEFT JOIN family_number_allocations allocation ON allocation.id = user.family_number_id
			WHERE user.id = ?`,
			params: [userId],
		});
		if (!user) return null;
		const children = await this.db.all<{
			id: string;
			full_name: string;
			birth_date: string;
			origin: string;
			family_display_id: string;
		}>({
			sql: `SELECT child.id, child.full_name, child.birth_date, child.origin,
				allocation.display_family_id AS family_display_id
			FROM children child
			JOIN family_number_allocations allocation ON allocation.id = child.family_number_id
			WHERE child.owner_user_id = ? ORDER BY child.full_name, child.id LIMIT 100`,
			params: [userId],
		});
		return { ...user, children: children.results };
	}

	async familyDestinations(input: { userId: string; query: string }) {
		const query = input.query.trim().toLocaleLowerCase('de-DE');
		if (query.length < 2) return [];
		const rows = await this.db.all<{
			allocation_id: string;
			legacy_family_id: string;
			display_family_id: string;
			parent_name_raw: string | null;
			numbering_status: string;
			allocation_status: string;
			owner_user_id: string | null;
			emails: string | null;
		}>({
			sql: `SELECT allocation.id AS allocation_id, family.id AS legacy_family_id,
				allocation.display_family_id, period.parent_name_raw,
				family.numbering_status, allocation.status AS allocation_status,
				allocation.owner_user_id,
				(SELECT group_concat(email.email_normalized, char(31))
					FROM legacy_family_emails email
					WHERE email.legacy_family_id = family.id AND email.is_current = 1
						AND email.email_normalized IS NOT NULL) AS emails
			FROM legacy_families family
			JOIN family_number_allocations allocation ON allocation.id = family.family_number_id
			LEFT JOIN legacy_family_periods period
				ON period.legacy_family_id = family.id AND period.is_current = 1
			WHERE lower(allocation.display_family_id) LIKE ?
				OR lower(coalesce(period.parent_name_raw, '')) LIKE ?
				OR EXISTS (SELECT 1 FROM legacy_family_emails searched
					WHERE searched.legacy_family_id = family.id AND searched.is_current = 1
						AND searched.email_normalized = ?)
			ORDER BY allocation.sequence_number DESC LIMIT 10`,
			params: [`%${query}%`, `%${query}%`, query],
		});
		return rows.results.map(({ emails, ...row }) => ({
			...row,
			maskedEmails: (emails ?? '')
				.split(String.fromCharCode(31))
				.filter(Boolean)
				.slice(0, 3)
				.map(maskLegacyEmail),
			eligibility:
				row.numbering_status !== 'valid' || row.allocation_status !== 'assigned'
					? 'collision_or_invalid'
					: row.owner_user_id && row.owner_user_id !== input.userId
						? 'owned_by_other'
						: row.owner_user_id === input.userId
							? 'already_owned'
							: 'eligible',
		}));
	}

	async listCatalog(query: AdminListQuery) {
		const normalized = query.q.toLocaleLowerCase('de-DE');
		const rows = await this.db.all<{
			id: string;
			academic_period_id: string;
			display_name: string;
			subject: string;
			lesson_kind: string;
			catalog_status: string;
			capacity_default: number | null;
			capacity_override: number | null;
			requires_admin_approval: number;
			academic_period: string;
			confirmed_mapping_count: number;
			session_count: number;
		}>({
			sql: `SELECT course.id, course.academic_period_id, course.display_name, course.subject, course.lesson_kind,
				course.catalog_status, course.capacity_default, course.capacity_override,
				course.requires_admin_approval, period.code AS academic_period,
				(SELECT COUNT(*) FROM course_source_mappings mapping
					WHERE mapping.course_group_id = course.id AND mapping.status = 'confirmed')
					AS confirmed_mapping_count,
				(SELECT COUNT(*) FROM course_sessions session
					WHERE session.course_group_id = course.id AND session.is_current = 1)
					AS session_count
			FROM course_groups course
			JOIN academic_periods period ON period.id = course.academic_period_id
			WHERE (? = '' OR course.catalog_status = ?)
				AND (? = '' OR lower(course.display_name) LIKE ?
					OR lower(course.subject) LIKE ? OR course.id = ?)
			ORDER BY course.display_name, course.id
			LIMIT ? OFFSET ?`,
			params: [
				query.status,
				query.status,
				normalized,
				`%${normalized}%`,
				`%${normalized}%`,
				query.q,
				PAGE_SIZE + 1,
				pageOffset(query.page),
			],
		});
		return paged(rows.results, query.page);
	}

	async mappingQueue() {
		const rows = await this.db.all<{
			task_id: string | null;
			legacy_enrollment_id: string;
			group_name_raw: string;
			academic_period_id: string;
		}>({
			sql: `SELECT task.id AS task_id, legacy.id AS legacy_enrollment_id,
				legacy.group_name_raw, legacy.academic_period_id
			FROM legacy_enrollments legacy
			LEFT JOIN admin_review_tasks task
				ON task.kind = 'course_mapping' AND task.source_kind = 'legacy_enrollment'
				AND task.source_id = legacy.id AND task.status IN ('open', 'in_progress')
			WHERE legacy.is_current = 1 AND legacy.course_group_id IS NULL
				AND legacy.lesson_kind IN ('group', 'dance_group')
			ORDER BY legacy.group_name_normalized, legacy.id LIMIT 50`,
		});
		return rows.results;
	}

	async pricingDiagnostics() {
		const versions = await this.db.all<{
			id: string;
			academic_period: string;
			label: string;
			valid_from: string;
			is_active: number;
			activated_at: string | null;
			rule_count: number;
		}>({
			sql: `SELECT version.id, period.code AS academic_period, version.label,
				version.valid_from, version.is_active, version.activated_at,
				(SELECT COUNT(*) FROM price_rules rule
					WHERE rule.price_version_id = version.id AND rule.is_valid = 1) AS rule_count
			FROM price_versions version
			JOIN academic_periods period ON period.id = version.academic_period_id
			ORDER BY version.is_active DESC, version.valid_from DESC LIMIT 20`,
		});
		const rules = await this.db.all<{
			id: string;
			price_version_id: string;
			key: string | null;
			children_count: number | null;
			yearly_price_cents: number | null;
			monthly_price_cents: number | null;
			duration_total_minutes: number | null;
			is_valid: number;
			validation_code: string | null;
		}>({
			sql: `SELECT rule.id, rule.price_version_id, rule.key, rule.children_count,
				rule.yearly_price_cents, rule.monthly_price_cents,
				rule.duration_total_minutes, rule.is_valid, rule.validation_code
			FROM price_rules rule
			JOIN price_versions version ON version.id = rule.price_version_id
			WHERE version.is_active = 1
			ORDER BY rule.key, rule.children_count, rule.source_row_number LIMIT 200`,
		});
		const diagnosticCounts = await this.db.first<{
			profiles_needing_review: number;
			estimates_needing_confirmation: number;
		}>({
			sql: `SELECT
				(SELECT COUNT(*) FROM course_pricing_profiles WHERE status = 'needs_review')
					AS profiles_needing_review,
				(SELECT COUNT(*) FROM price_quotes
					WHERE status = 'needs_admin_confirmation') AS estimates_needing_confirmation`,
		});
		return {
			versions: versions.results,
			rules: rules.results,
			diagnosticCounts: diagnosticCounts ?? {
				profiles_needing_review: 0,
				estimates_needing_confirmation: 0,
			},
		};
	}
}
