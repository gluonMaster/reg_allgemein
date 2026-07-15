import { DatabaseBoundary } from '$lib/server/db/database';

export class OccupancyRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async activeChildrenCount(courseGroupId: string, asOf: string): Promise<number> {
		const parsedDate = /^\d{4}-\d{2}-\d{2}$/u.test(asOf)
			? new Date(`${asOf}T00:00:00.000Z`)
			: null;
		if (
			!parsedDate ||
			Number.isNaN(parsedDate.valueOf()) ||
			parsedDate.toISOString().slice(0, 10) !== asOf
		) {
			throw new TypeError('asOf must be a valid YYYY-MM-DD calendar date.');
		}
		const row = await this.db.first<{ count: number }>({
			sql: `WITH qualifying_portal AS (
					SELECT enrollment.child_id
					FROM enrollments AS enrollment
					WHERE enrollment.course_group_id = ?
						AND enrollment.status = 'active'
						AND enrollment.active_from <= ?
						AND (enrollment.active_until IS NULL OR ? < enrollment.active_until)
				), qualifying_legacy AS (
					SELECT legacy.child_id
					FROM legacy_enrollments AS legacy
					WHERE legacy.course_group_id = ?
						AND legacy.is_current = 1
						AND legacy.is_active_for_occupancy = 1
						AND (
							legacy.represented_by_enrollment_id IS NULL
							OR NOT EXISTS (
								SELECT 1
								FROM enrollments AS represented
								WHERE represented.id = legacy.represented_by_enrollment_id
									AND represented.course_group_id = legacy.course_group_id
									AND represented.status = 'active'
									AND represented.active_from <= ?
									AND (represented.active_until IS NULL OR ? < represented.active_until)
							)
						)
				), unique_children AS (
					SELECT child_id FROM qualifying_portal
					UNION
					SELECT child_id FROM qualifying_legacy
				)
				SELECT COUNT(*) AS count FROM unique_children`,
			params: [courseGroupId, asOf, asOf, courseGroupId, asOf, asOf],
		});
		return row?.count ?? 0;
	}
}
