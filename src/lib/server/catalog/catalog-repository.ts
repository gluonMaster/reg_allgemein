import { DatabaseBoundary } from '$lib/server/db/database';

export type CatalogLessonKind = 'group' | 'dance_group' | 'nachhilfe' | 'individual';

export interface PublishedCourseRow {
	id: string;
	academic_period_id: string;
	academic_period_display: string;
	schedule_version_id: string;
	display_name: string;
	subject: string;
	lesson_kind: CatalogLessonKind;
	capacity_default: number | null;
	capacity_override: number | null;
	requires_admin_approval: 0 | 1;
}

export interface PublishedSessionRow {
	id: string;
	course_group_id: string;
	day_code: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
	start_time: string;
	end_time: string;
	duration_minutes: number;
	teacher_name: string;
	location_display: string;
	timezone: 'Europe/Berlin';
}

export class CatalogRepository {
	constructor(private readonly db: DatabaseBoundary) {}

	async listPublishedCourses(): Promise<PublishedCourseRow[]> {
		const rows = await this.db.all<PublishedCourseRow>({
			sql: `SELECT course.id, course.academic_period_id,
				period.display_name AS academic_period_display,
				schedule.id AS schedule_version_id, course.display_name, course.subject,
				course.lesson_kind, course.capacity_default, course.capacity_override,
				course.requires_admin_approval
			FROM academic_periods AS period
			JOIN schedule_versions AS schedule
				ON schedule.academic_period_id = period.id AND schedule.is_published = 1
			JOIN course_groups AS course
				ON course.academic_period_id = period.id AND course.catalog_status = 'published'
			WHERE period.is_current = 1
				AND course.lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual')
				AND EXISTS (SELECT 1 FROM course_sessions AS session
					WHERE session.course_group_id = course.id
						AND session.schedule_version_id = schedule.id
						AND session.is_current = 1)
			ORDER BY course.display_name, course.subject, course.id`,
		});
		return rows.results;
	}

	loadPublishedCourse(courseGroupId: string): Promise<PublishedCourseRow | null> {
		return this.db.first<PublishedCourseRow>({
			sql: `SELECT course.id, course.academic_period_id,
				period.display_name AS academic_period_display,
				schedule.id AS schedule_version_id, course.display_name, course.subject,
				course.lesson_kind, course.capacity_default, course.capacity_override,
				course.requires_admin_approval
			FROM academic_periods AS period
			JOIN schedule_versions AS schedule
				ON schedule.academic_period_id = period.id AND schedule.is_published = 1
			JOIN course_groups AS course
				ON course.academic_period_id = period.id AND course.catalog_status = 'published'
			WHERE period.is_current = 1 AND course.id = ?
				AND course.lesson_kind IN ('group', 'dance_group', 'nachhilfe', 'individual')`,
			params: [courseGroupId],
		});
	}

	async listSessions(courseGroupId: string, scheduleVersionId: string): Promise<PublishedSessionRow[]> {
		const rows = await this.db.all<PublishedSessionRow>({
			sql: `SELECT session.id, session.course_group_id, session.day_code,
				session.start_time, session.end_time, session.duration_minutes,
				session.teacher_name, session.location_display, session.timezone
			FROM course_sessions AS session
			WHERE session.course_group_id = ? AND session.schedule_version_id = ?
				AND session.is_current = 1
			ORDER BY CASE session.day_code
				WHEN 'MO' THEN 1 WHEN 'TU' THEN 2 WHEN 'WE' THEN 3 WHEN 'TH' THEN 4
				WHEN 'FR' THEN 5 WHEN 'SA' THEN 6 ELSE 7 END,
				session.start_time, session.id`,
			params: [courseGroupId, scheduleVersionId],
		});
		return rows.results;
	}
}
