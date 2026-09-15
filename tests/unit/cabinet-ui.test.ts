import { formatCalendarDate, formatTimestamp } from '$lib/i18n/locale';
import { MessageService } from '$lib/server/messages/message-service';
import { TrialService } from '$lib/server/trials/trial-service';
import { IndividualRequestService } from '$lib/server/requests/request-service';
import { actions } from '../../src/routes/cabinet/+page.server';
import { requireCsrf } from '$lib/server/security/csrf';

const mocks = vi.hoisted(() => ({
	createChild: vi.fn(),
	updateChild: vi.fn(),
	requestCorrection: vi.fn(),
}));
vi.mock('$lib/server/cabinet/runtime', () => ({
	requestCabinetRuntime: () => ({ service: mocks }),
}));
vi.mock('$lib/server/security/csrf', () => ({ requireCsrf: vi.fn() }));

describe('cabinet child feedback', () => {
	it('keeps entered values when CSRF rejects and never calls a child write', async () => {
		vi.clearAllMocks();
		vi.mocked(requireCsrf).mockRejectedValueOnce(new Error('Rejected'));
		const body = new FormData();
		body.set('childId', 'synthetic-child');
		body.set('fullName', 'Synthetic Retained Child');
		body.set('birthDate', '2015-01-10');
		const result = await actions.updateChild({
			request: new Request('https://portal.invalid/cabinet', { method: 'POST', body }),
			locals: { locale: 'de' },
		} as never);
		expect(result).toMatchObject({
			status: 403,
			data: {
				childForm: {
					action: 'updateChild',
					childId: 'synthetic-child',
					fullName: 'Synthetic Retained Child',
					birthDate: '2015-01-10',
				},
			},
		});
		expect(mocks.updateChild).not.toHaveBeenCalled();
	});
	it.each(['createChild', 'updateChild', 'requestCorrection'] as const)(
		'retains only submitted child fields on %s failure',
		async (action) => {
			mocks[action].mockResolvedValue(action === 'requestCorrection' ? false : 'duplicate');
			const body = new FormData();
			body.set('fullName', 'Synthetic Changed Child');
			body.set('birthDate', '2016-03-27');
			body.set('_csrf', 'synthetic-csrf');
			body.set('unrelated', 'must-not-echo');
			if (action !== 'createChild') body.set('childId', 'synthetic-child');
			const result = await actions[action]({
				request: new Request('https://portal.invalid/cabinet', { method: 'POST', body }),
				locals: {
					user: { id: 'synthetic-parent', role: 'parent', emailVerified: true },
					locale: 'ru',
					requestId: 'synthetic-request',
				},
			} as never);
			expect(result).toMatchObject({
				data: {
					success: false,
					childForm: {
						action,
						fullName: 'Synthetic Changed Child',
						birthDate: '2016-03-27',
						...(action !== 'createChild' ? { childId: 'synthetic-child' } : {}),
					},
				},
			});
			expect(JSON.stringify(result)).not.toMatch(/synthetic-csrf|must-not-echo/);
			if (action !== 'requestCorrection')
				expect(result).toMatchObject({ status: 409, data: { duplicate: true } });
		}
	);
});

describe('cabinet display dates and contributors', () => {
	it('keeps calendar days and handles Berlin midnight and both DST offsets', () => {
		expect(formatCalendarDate('de', '2026-03-29')).toBe('29.03.2026');
		expect(formatCalendarDate('ru', '2026-03-29')).toContain('29 мар. 2026');
		expect(formatTimestamp('de', '2026-01-01T23:30:00Z')).toBe('02.01.2026, 00:30');
		expect(formatTimestamp('de', '2026-03-29T01:30:00Z')).toBe('29.03.2026, 03:30');
		expect(formatTimestamp('de', '2026-10-25T01:30:00Z')).toBe('25.10.2026, 02:30');
		expect(formatCalendarDate('de', 'invalid')).toBe('invalid');
	});
	it('localizes message category/time without translating the subject', async () => {
		const service = new MessageService(
			{
				listOwnerThreads: async () => [
					{
						id: 'thread',
						subject: 'Synthetic subject',
						category: 'contract',
						status: 'open',
						updatedAt: '2026-03-29T01:30:00Z',
						publicReference: 'reference',
					},
				],
			} as never,
			{} as never
		);
		const { threads } = await service.contribute('owner', 'ru');
		expect(threads[0]).toMatchObject({
			label: 'Synthetic subject',
			href: '/messages/reference',
		});
		expect(threads[0].detail).toContain('Договор');
		expect(threads[0].detail).toContain('03:30');
	});
	it('shows confirmed trial dates and inclusive funding dates using the chosen locale', async () => {
		const trial = new TrialService(
			{
				listOwnerTrials: async () => [
					{
						id: 'trial',
						child_name: 'Synthetic',
						course_name: 'Art',
						status: 'confirmed',
						confirmed_date: '2026-10-25',
						requested_date: '2026-10-24',
					},
				],
			} as never,
			{} as never,
			{} as never
		);
		expect((await trial.contribute('owner', 'de')).trials[0]).toMatchObject({
			detail: '25.10.2026',
			cancellable: true,
		});
		const request = new IndividualRequestService(
			{
				listOwnerRequests: async () => [
					{
						id: 'request',
						child_name: 'Synthetic',
						request_kind: 'nachhilfe',
						funding_kind: 'jobcenter',
						status: 'needs_documents',
						valid_from: '2026-03-29',
						valid_until: '2026-10-25',
					},
				],
			} as never,
			{} as never
		);
		const { requests } = await request.contribute('owner', 'de');
		expect(requests[0].detail).toContain('29.03.2026–25.10.2026');
	});
});
