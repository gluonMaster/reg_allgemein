import { error, type RequestEvent } from '@sveltejs/kit';
import { catalog, intakeRuntime, adminList, adminDetail, verify } from './http.server';
import { INTAKE_PRIVACY_VERSION, type AdminGroupsData, type IntakeFormData } from '../contracts';
import { t } from '../i18n';

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
	try {
		return { ...base, ...(await catalog(event)), catalogError: false };
	} catch {
		return { ...base, lessons: [], closedLessonIds: [], catalogError: true };
	}
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
