import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import {
	catalog,
	intakeRuntime,
	adminList,
	adminDetail,
	verify,
	waitlistAttention,
	withdrawal,
} from './http.server';
import {
	INTAKE_PRIVACY_VERSION,
	type AdminGroupsData,
	type CatalogData,
	type IntakeFormData,
	type Lesson,
	type WaitlistPageData,
	type WithdrawalData,
} from '../contracts';
import { isPlannedLesson } from '../planned';
import { t } from '../i18n';
import { courseState } from './waitlist.server';

export async function loadIntakeForm(event: RequestEvent): Promise<IntakeFormData> {
	const { config } = intakeRuntime(event);
	const base = {
		selectedId: event.url.searchParams.get('lesson') ?? '',
		scheduleUrl: config.trialIntake!.scheduleUrl,
		accepting: config.trialIntake!.accepting,
		turnstileSiteKey: config.turnstileSiteKey,
		privacyVersion: INTAKE_PRIVACY_VERSION,
		now: new Date().toISOString(),
	} satisfies Omit<IntakeFormData, 'lessons' | 'closedLessonIds' | 'catalogError'>;
	if (!base.accepting) return { ...base, lessons: [], closedLessonIds: [], catalogError: false };
	let data: CatalogData;
	try {
		data = await catalog(event);
	} catch {
		return { ...base, lessons: [], closedLessonIds: [], catalogError: true };
	}
	// WL-03: an old trial link of a planned course leads to its waitlist, with nothing else.
	const planned = data.lessons.find((l) => l.id === base.selectedId && isPlannedLesson(l));
	if (planned) redirect(303, `/warteliste?lesson=${planned.id}`);
	return { ...base, ...data, catalogError: false };
}
/** `/warteliste?lesson=<id>`: the states of TRIAL_INTAKE_WAITLIST in their order (WL-04). */
export async function loadWaitlistPage(event: RequestEvent): Promise<WaitlistPageData> {
	const r = intakeRuntime(event);
	const base = {
		lesson: null,
		offer: null,
		firstDate: null,
		scheduleUrl: r.config.trialIntake!.scheduleUrl,
		turnstileSiteKey: r.config.turnstileSiteKey,
		now: new Date().toISOString(),
	};
	if (!r.config.trialIntake!.accepting) return { ...base, state: 'maintenance' };
	let lessons: Lesson[];
	try {
		lessons = await r.catalog.read();
	} catch {
		return { ...base, state: 'catalog_error' };
	}
	const lesson = lessons.find((l) => l.id === event.url.searchParams.get('lesson'));
	if (!lesson) return { ...base, state: 'not_found' };
	if (!isPlannedLesson(lesson)) redirect(303, `/probestunde?lesson=${lesson.id}`);
	const course = await courseState(r.service.db, lessons, lesson);
	if (course.state === 'open') return { ...base, state: 'form', lesson, offer: course.offer };
	return {
		...base,
		state: course.state,
		lesson,
		firstDate: course.state === 'started' ? course.firstDate : null,
	};
}
export async function loadWithdrawal(event: RequestEvent): Promise<WithdrawalData> {
	const r = intakeRuntime(event);
	return {
		...((await withdrawal(event)) as Omit<WithdrawalData, 'scheduleUrl'>),
		scheduleUrl: r.config.trialIntake!.scheduleUrl,
	};
}
export async function loadIntakeGroups(event: RequestEvent): Promise<AdminGroupsData> {
	const runtime = intakeRuntime(event);
	// The admin check runs first; a missing schedule must still show what is stored.
	const closed = await runtime.admin.closedLessons(event.locals.user);
	try {
		return { lessons: [...(await runtime.catalog.read())], closed, catalogError: false };
	} catch {
		return { lessons: [], closed, catalogError: true };
	}
}
export async function loadIntakeVerification(event: RequestEvent) {
	return {
		verification: await verify(event),
		scheduleUrl: intakeRuntime(event).config.trialIntake!.scheduleUrl,
	};
}
export async function loadIntakeList(event: RequestEvent) {
	try {
		const { admin } = intakeRuntime(event);
		return {
			intakeList: await adminList(event),
			emailQueue: await admin.emailQueue(event.locals.user),
			deliveryAttention: await admin.deliveryAttention(event.locals.user),
			waitlist: await waitlistAttention(event),
		};
	} catch (e) {
		if (e instanceof Error && e.name === 'ZodError')
			error(400, {
				code: 'INTAKE_INPUT_INVALID',
				message: t(event.locals.locale ?? 'de', 'inputError'),
				requestId: event.locals.requestId,
			});
		throw e;
	}
}
/** Request context for the shared delivery page; only rows produced by trial intake. */
export async function loadIntakeOutboxContext(
	event: RequestEvent,
	rows: { sourceKind: string; sourceId: string }[]
) {
	return intakeRuntime(event).admin.outboxContext(
		event.locals.user,
		rows.filter((row) => row.sourceKind === 'trial_intake').map((row) => row.sourceId),
		event.locals.requestId,
		new Date().toISOString()
	);
}
export async function loadIntakeDetail(event: RequestEvent) {
	try {
		return { intakeDetail: await adminDetail(event) };
	} catch (e) {
		if (e instanceof Error && e.message === 'INTAKE_NOT_FOUND')
			error(404, {
				code: 'INTAKE_NOT_FOUND',
				message: t(event.locals.locale ?? 'de', 'empty'),
				requestId: event.locals.requestId,
			});
		throw e;
	}
}
