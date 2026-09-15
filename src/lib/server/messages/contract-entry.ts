import { formatMessage, translate } from '$lib/i18n';
import type { CatalogRepository } from '$lib/server/catalog/catalog-repository';

/** Read-only entry into the ordinary message form; never creates a request or offer. */
export async function loadContractInquiry(
	repository: Pick<CatalogRepository, 'loadPublishedCourse' | 'listSessions'>,
	courseId: string | null,
	locale: string
) {
	if (!courseId || courseId.length > 200 || courseId !== courseId.trim()) return null;
	const course = await repository.loadPublishedCourse(courseId);
	if (!course || !['group', 'dance_group'].includes(course.lesson_kind)) return null;
	const sessions = await repository.listSessions(course.id, course.schedule_version_id);
	// Match catalog visibility: a published course needs a current published session.
	if (sessions.length === 0) return null;
	const schedule = sessions.map((session) =>
		`${translate(locale, `ui.day.${session.day_code}`)} ${session.start_time}–${session.end_time} · ${session.teacher_name} · ${session.location_display}`
	).join('\n');
	return {
		category: 'contract' as const,
		subject: formatMessage(locale, 'catalog.contract.subject', { course: course.display_name }).slice(0, 160),
		message: formatMessage(locale, 'catalog.contract.message', {
			course: course.display_name,
			subject: course.subject,
			period: course.academic_period_display,
			schedule,
		}).slice(0, 4000),
	};
}
