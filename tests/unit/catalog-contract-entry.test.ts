import { formatMessage } from '$lib/i18n';
import { requireCsrf } from '$lib/server/security/csrf';
import { actions, load } from '../../src/routes/messages/+page.server';

const mocks = vi.hoisted(() => ({
	loadPublishedCourse: vi.fn(), listSessions: vi.fn(),
	listOwnerThreads: vi.fn(async () => []), listAbsenceEnrollments: vi.fn(async () => []),
	createThread: vi.fn(), createAbsence: vi.fn(),
}));
vi.mock('$lib/server/catalog/runtime', () => ({ requestCatalogRuntime: () => ({ repository: mocks }) }));
vi.mock('$lib/server/messages/runtime', () => ({ requestMessageRuntime: () => ({ repository: mocks, service: mocks }) }));
vi.mock('$lib/server/security/csrf', () => ({ requireCsrf: vi.fn() }));

const actor = { id: 'synthetic-parent', role: 'parent', emailVerified: true };
function event(query = '', body?: FormData, locale = 'de') {
	return {
		url: new URL(`https://portal.invalid/messages${query}`),
		request: new Request('https://portal.invalid/messages', body ? { method: 'POST', body } : {}),
		locals: { user: actor, locale, requestId: 'synthetic-request' },
		cookies: { get: () => 'synthetic-csrf' },
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.loadPublishedCourse.mockResolvedValue({
		id: 'course-1', lesson_kind: 'group', schedule_version_id: 'schedule-1',
		display_name: 'Synthetic Art', subject: 'Kunst', academic_period_display: '2026/2027',
	});
	mocks.listSessions.mockResolvedValue([{
		day_code: 'MO', start_time: '15:00', end_time: '16:30', teacher_name: 'Synthetic Teacher', location_display: 'A',
	}]);
});

describe('catalog contract entry route', () => {
	it.each(['de', 'ru'])('loads editable %s contract text from published data without business writes', async (locale) => {
		const result = await load(event('?course=course-1&subject=untrusted&message=untrusted', undefined, locale) as never);
		expect(result).toMatchObject({ contractInquiry: {
			category: 'contract',
			subject: formatMessage(locale, 'catalog.contract.subject', { course: 'Synthetic Art' }),
			message: expect.stringContaining('Synthetic Art'),
		} });
		expect(JSON.stringify(result)).toContain('15:00–16:30');
		expect(JSON.stringify(result)).not.toContain('untrusted');
		expect(mocks.loadPublishedCourse).toHaveBeenCalledWith('course-1');
		expect(mocks.createThread).not.toHaveBeenCalled();
		expect(mocks.createAbsence).not.toHaveBeenCalled();
	});
	it('uses the ordinary form without a parameter or when a course is unavailable', async () => {
		expect(await load(event() as never)).toMatchObject({ contractInquiry: null });
		expect(mocks.loadPublishedCourse).not.toHaveBeenCalled();
		mocks.loadPublishedCourse.mockResolvedValueOnce(null);
		expect(await load(event('?course=hidden') as never)).toMatchObject({ contractInquiry: null });
		expect(mocks.listSessions).not.toHaveBeenCalled();
		mocks.listSessions.mockResolvedValueOnce([]);
		expect(await load(event('?course=no-current-session') as never)).toMatchObject({ contractInquiry: null });
	});
	it.each(['validation', 'csrf'])('preserves edited fields and retry identity after %s failure', async (failure) => {
		const values = { category: 'contract', subject: 'Synthetic edited subject', message: '  ', idempotencyKey: 'synthetic-retry-key' };
		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.set(key, value);
		body.set('_csrf', 'do-not-echo-token');
		body.set('unrelated', 'do-not-echo-field');
		if (failure === 'csrf') vi.mocked(requireCsrf).mockRejectedValueOnce(new Error('Rejected'));
		else mocks.createThread.mockRejectedValueOnce(new Error('Invalid'));
		const result = await actions.create(event('', body) as never);
		expect(result).toMatchObject({ status: 409, data: { success: false, threadValues: values } });
		expect(JSON.stringify(result)).not.toContain('do-not-echo');
		if (failure === 'csrf') expect(mocks.createThread).not.toHaveBeenCalled();
		else expect(mocks.createThread).toHaveBeenCalledWith(expect.objectContaining({ actor, payload: values }));
	});
	it('submits the edited ordinary payload through the existing guarded service', async () => {
		const values = { category: 'technical', subject: 'Synthetic question', message: 'Synthetic edited body', idempotencyKey: 'synthetic-submit-key' };
		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.set(key, value);
		body.set('_csrf', 'synthetic-csrf');
		expect(await actions.create(event('', body) as never)).toMatchObject({ success: true });
		expect(requireCsrf).toHaveBeenCalledWith(expect.objectContaining({ submittedToken: 'synthetic-csrf' }));
		expect(mocks.createThread).toHaveBeenCalledWith(expect.objectContaining({ actor, payload: values }));
	});
});
