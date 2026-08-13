import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { CabinetReadModelContributor } from '$lib/server/cabinet/cabinet-service';
import { CatalogRepository } from '$lib/server/catalog/catalog-repository';
import type { CatalogAvailability } from '$lib/server/catalog/catalog-service';
import { OccupancyRepository } from '$lib/server/pricing/occupancy-repository';
import { berlinCalendarDate } from '$lib/server/time/berlin';
import { requireParent } from '$lib/server/security/authorization';
import { trialParentCancellationSchema, trialSubmissionSchema } from './contracts';
import { TrialError, TrialRepository } from './trial-repository';

export class TrialService implements CabinetReadModelContributor {
	constructor(
		private readonly repository: TrialRepository,
		private readonly catalog: CatalogRepository,
		private readonly occupancy: OccupancyRepository,
		private readonly now: () => string = () => new Date().toISOString()
	) {}

	async loadSubmissionPage(actor: AuthenticatedUser, courseGroupId: string) {
		try {
			requireParent(actor);
		} catch {
			throw new TrialError('PARENT_REQUIRED');
		}
		const course = await this.catalog.loadPublishedCourse(courseGroupId);
		if (!course || (course.lesson_kind !== 'group' && course.lesson_kind !== 'dance_group')) {
			throw new TrialError('TRIAL_NOT_ALLOWED_FOR_LESSON_KIND');
		}
		const [sessions, children] = await Promise.all([
			this.catalog.listSessions(course.id, course.schedule_version_id),
			this.repository.listOwnedChildren(actor.id),
		]);
		return {
			course: { id: course.id, displayName: course.display_name, subject: course.subject },
			sessions: sessions.map((session) => ({
				id: session.id,
				dayCode: session.day_code,
				startTime: session.start_time,
				endTime: session.end_time,
				teacherName: session.teacher_name,
				locationDisplay: session.location_display,
			})),
			children: children.map((child) => ({
				id: child.id,
				fullName: child.full_name,
				birthDate: child.birth_date,
			})),
		};
	}

	async submit(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
	}) {
		try {
			requireParent(input.actor);
		} catch {
			throw new TrialError('PARENT_REQUIRED');
		}
		const parsed = trialSubmissionSchema.safeParse(input.payload);
		if (!parsed.success) throw new TrialError('INVALID_TRIAL_REQUEST');
		const now = this.now();
		const today = berlinCalendarDate(now);
		if (parsed.data.requestedDate <= today) throw new TrialError('TRIAL_DATE_NOT_FUTURE');
		const course = await this.catalog.loadPublishedCourse(parsed.data.courseGroupId);
		if (!course || (course.lesson_kind !== 'group' && course.lesson_kind !== 'dance_group')) {
			throw new TrialError('TRIAL_NOT_ALLOWED_FOR_LESSON_KIND');
		}
		const [sessions, owned, activeChildrenCount] = await Promise.all([
			this.catalog.listSessions(course.id, course.schedule_version_id),
			this.repository.ownsCurrentChild(input.actor.id, parsed.data.childId),
			this.occupancy.activeChildrenCount(course.id, parsed.data.requestedDate),
		]);
		if (!owned) throw new TrialError('TRIAL_CHILD_NOT_OWNED');
		if (!sessions.some((session) => session.id === parsed.data.sessionId)) {
			throw new TrialError('TRIAL_SESSION_NOT_CURRENT');
		}
		const capacity = course.capacity_override ?? course.capacity_default;
		const availability: CatalogAvailability =
			capacity === null
				? 'unknown'
				: activeChildrenCount >= capacity
					? 'full'
					: course.requires_admin_approval === 1
						? 'requires_admin_review'
						: 'available';
		return this.repository.createRequested({
			id: crypto.randomUUID(),
			userId: input.actor.id,
			childId: parsed.data.childId,
			courseGroupId: parsed.data.courseGroupId,
			sessionId: parsed.data.sessionId,
			requestedDate: parsed.data.requestedDate,
			availability,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
	}

	async cancel(input: { actor: AuthenticatedUser; payload: unknown; requestId: string }) {
		try {
			requireParent(input.actor);
		} catch {
			throw new TrialError('PARENT_REQUIRED');
		}
		const parsed = trialParentCancellationSchema.safeParse(input.payload);
		if (!parsed.success) throw new TrialError('INVALID_TRIAL_CANCELLATION');
		return this.repository.cancelByParent({
			trialId: parsed.data.trialId,
			userId: input.actor.id,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now: this.now(),
		});
	}

	async contribute(userId: string) {
		const trials = await this.repository.listOwnerTrials(userId);
		return {
			trials: trials.map((trial) => ({
				id: trial.id,
				label: `${trial.child_name} · ${trial.course_name}`,
				status: trial.status,
				detail: trial.confirmed_date ?? trial.requested_date,
				cancellable: trial.status === 'requested' || trial.status === 'confirmed',
			})),
		};
	}
}
