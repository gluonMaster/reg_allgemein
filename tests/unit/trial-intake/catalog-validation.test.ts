import fixture from '../../fixtures/trial-intake/catalog-v1.json';
import {
	CatalogReader,
	parseCatalog,
	boundedText,
	lessonIdentity,
} from '$lib/trial-intake/server/catalog.server';
import {
	berlinDate,
	nextLessonDate,
	validateSubmission,
} from '$lib/trial-intake/server/validation.server';
import { INTAKE_PRIVACY_VERSION } from '$lib/trial-intake/contracts';

export const fixtureHtml = `<html><script type="application/json" id="trial-intake-catalog">${JSON.stringify(fixture).replaceAll('<', '\\u003c')}</script></html>`;
describe('trial intake catalog and validation', () => {
	it('reads the versioned public block, validates identity and deduplicates cards', async () => {
		const lessons = await parseCatalog(fixtureHtml);
		expect(lessons).toHaveLength(2);
		expect(await lessonIdentity(lessons[0])).toBe(lessons[0].id);
		const repeated = { ...fixture, lessons: [fixture.lessons[0], fixture.lessons[0]] };
		expect(
			await parseCatalog(
				fixtureHtml.replace(JSON.stringify(fixture), JSON.stringify(repeated))
			)
		).toHaveLength(1);
		for (const html of [
			fixtureHtml.replace('"version":1', '"version":2'),
			fixtureHtml.replace('Musik', 'Changed'),
			fixtureHtml + fixtureHtml,
			'<html>no catalog</html>',
		]) {
			await expect(parseCatalog(html)).rejects.toMatchObject({
				code: 'INTAKE_CATALOG_UNAVAILABLE',
			});
		}
	});
	it('bounds both source/body reading and forbids redirects', async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixtureHtml));
		const reader = new CatalogReader('https://schedule.example.test/', fetcher);
		expect(await reader.read()).toHaveLength(2);
		expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
		fetcher.mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)));
		await expect(reader.read()).rejects.toMatchObject({ status: 503 });
		await expect(boundedText(new Response('é'.repeat(9000)).body, 16384)).rejects.toMatchObject(
			{ status: 413 }
		);
		await expect(
			new CatalogReader('http://example.test', fetcher).read()
		).rejects.toMatchObject({ status: 503 });
	});
	it('uses only fresh cache and rejects stale fallback after source failure', async () => {
		const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
		const cache = {
			match: vi.fn().mockResolvedValue(
				new Response(fixtureHtml, {
					headers: { 'x-intake-cached-at': String(Date.now()) },
				})
			),
			put: vi.fn(),
		} as unknown as Cache;
		expect(
			await new CatalogReader('https://schedule.example.test/', fetcher, cache).read()
		).toHaveLength(2);
		expect(fetcher).not.toHaveBeenCalled();
		vi.mocked(cache.match).mockResolvedValue(
			new Response(fixtureHtml, {
				headers: { 'x-intake-cached-at': String(Date.now() - 300001) },
			})
		);
		await expect(
			new CatalogReader('https://schedule.example.test/', fetcher, cache).read()
		).rejects.toMatchObject({ status: 503 });
	});
	it('respects Berlin tomorrow across midnight/DST; rejects invalid dates and assignments', async () => {
		const lessons = await parseCatalog(fixtureHtml);
		expect(berlinDate('2026-09-16T22:30:00.000Z')).toBe('2026-09-17');
		expect(nextLessonDate(7, '2026-10-24T22:30:00.000Z')).toBe('2026-11-01');
		const data = {
			idempotencyKey: 'a'.repeat(32),
			parentFirstName: 'Synthetic',
			parentLastName: 'Parent',
			email: 'guest@example.test',
			phone: '+49 000000000',
			locale: 'de',
			privacyVersion: INTAKE_PRIVACY_VERSION,
			children: [
				{ key: 'a', firstName: 'Child', lastName: 'Synthetic', birthDate: '2020-02-29' },
			],
			items: [{ lessonId: lessons[0].id, desiredDate: '2026-09-17', childKeys: ['a'] }],
		};
		expect(validateSubmission(data, lessons, '2026-09-16T12:00:00.000Z').items).toHaveLength(1);
		for (const date of ['2026-09-16', '2026-09-18', '2026-02-30', '2020-09-17']) {
			expect(() =>
				validateSubmission(
					{ ...data, items: [{ ...data.items[0], desiredDate: date }] },
					lessons,
					'2026-09-16T12:00:00.000Z'
				)
			).toThrow();
		}
		expect(() =>
			validateSubmission(
				{ ...data, items: [{ ...data.items[0], childKeys: ['foreign'] }] },
				lessons,
				'2026-09-16T12:00:00.000Z'
			)
		).toThrow();
		expect(() =>
			validateSubmission(
				{ ...data, items: [data.items[0], data.items[0]] },
				lessons,
				'2026-09-16T12:00:00.000Z'
			)
		).toThrow();
	});
});
