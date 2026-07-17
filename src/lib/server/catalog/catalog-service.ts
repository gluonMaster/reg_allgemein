import { berlinCalendarDate } from '$lib/server/time/berlin';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { PricingService } from '$lib/server/pricing/pricing-service';
import {
	CatalogRepository,
	type CatalogLessonKind,
	type PublishedCourseRow,
} from './catalog-repository';

export type CatalogAvailability = 'available' | 'full' | 'unknown' | 'requires_admin_review';

function availabilityFor(course: PublishedCourseRow, activeChildrenCount: number) {
	const capacity = course.capacity_override ?? course.capacity_default;
	const status: CatalogAvailability =
		capacity === null
			? 'unknown'
			: activeChildrenCount >= capacity
				? 'full'
				: course.requires_admin_approval === 1
					? 'requires_admin_review'
					: 'available';
	return { status, capacity };
}

function ctaFor(courseId: string, lessonKind: CatalogLessonKind) {
	if (lessonKind === 'group' || lessonKind === 'dance_group') {
		return { kind: 'trial' as const, href: `/catalog/${encodeURIComponent(courseId)}/trial` };
	}
	return {
		kind: lessonKind === 'nachhilfe' ? ('nachhilfe_request' as const) : ('individual_request' as const),
		href: `/requests/new?kind=${lessonKind}`,
	};
}

export class CatalogService {
	constructor(
		private readonly repository: CatalogRepository,
		private readonly occupancy: OccupancyRepository,
		private readonly pricing: PricingService,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	async loadPublishedCatalog() {
		const now = this.now();
		const asOf = berlinCalendarDate(now);
		const courses = await this.repository.listPublishedCourses();
		return Promise.all(
			courses.map(async (course) => {
				const [sessions, activeChildrenCount, quote] = await Promise.all([
					this.repository.listSessions(course.id, course.schedule_version_id),
					this.occupancy.activeChildrenCount(course.id, asOf),
					this.pricing.createPublicQuote(
						{ courseGroupId: course.id, plannedStartOn: asOf },
						now
					),
				]);
				const availability = availabilityFor(course, activeChildrenCount);
				return {
					id: course.id,
					academicPeriod: course.academic_period_display,
					displayName: course.display_name,
					subject: course.subject,
					lessonKind: course.lesson_kind,
					sessions: sessions.map((session) => ({
						id: session.id,
						dayCode: session.day_code,
						startTime: session.start_time,
						endTime: session.end_time,
						durationMinutes: session.duration_minutes,
						teacherName: session.teacher_name,
						locationDisplay: session.location_display,
						timezone: session.timezone,
					})),
					availability: {
						...availability,
						requiresManualReview: availability.status !== 'available',
					},
					quote: {
						id: quote.id,
						status: quote.status,
						amountCents: quote.decision.finalPriceCents,
						billingPeriodCode: quote.decision.billingPeriodCode,
						parentPayable: quote.decision.parentPayable,
						estimated: quote.decision.estimatedMissingDuration,
						requiresAdminConfirmation: quote.decision.requiresAdminConfirmation,
					},
					cta: ctaFor(course.id, course.lesson_kind),
				};
			})
		);
	}
}
