import { z } from 'zod';
import type { Lesson } from '../contracts';
import { sha256Hex } from '$lib/server/security/digest';
import { IntakeError, textField } from './validation.server';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const lessonSchema = z
	.object({
		id: z.string().regex(/^[a-f0-9]{64}$/u),
		subject: textField,
		group: textField,
		weekday: z.number().int().min(1).max(7),
		start: time,
		end: time,
		teacher: textField,
		room: textField,
		building: z.enum(['Kolibri', 'Villa']),
	})
	.strict()
	.refine((v) => v.end > v.start);
const schema = z
	.object({ version: z.literal(1), lessons: z.array(lessonSchema).min(1).max(500) })
	.strict();
export function lessonIdentity(lesson: Omit<Lesson, 'id'>): Promise<string> {
	return sha256Hex(
		JSON.stringify(
			[
				lesson.subject,
				lesson.group,
				lesson.weekday,
				lesson.start,
				lesson.end,
				lesson.teacher,
				lesson.room,
				lesson.building,
			].map((v) => (typeof v === 'string' ? v.trim().normalize('NFC') : v))
		)
	);
}
export async function parseCatalog(html: string): Promise<Lesson[]> {
	// This deliberately reads only the exporter-owned inert JSON block, never the visual DOM.
	const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)].filter((m) =>
		/\bid\s*=\s*["']trial-intake-catalog["']/iu.test(m[1])
	);
	if (blocks.length !== 1 || !/\btype\s*=\s*["']application\/json["']/iu.test(blocks[0][1])) {
		throw new IntakeError('INTAKE_CATALOG_UNAVAILABLE', 503);
	}
	try {
		const { lessons } = schema.parse(JSON.parse(blocks[0][2]));
		const unique = new Map<string, Lesson>();
		for (const lesson of lessons) {
			if ((await lessonIdentity(lesson)) !== lesson.id) throw new Error();
			unique.set(lesson.id, lesson);
		}
		return [...unique.values()];
	} catch {
		throw new IntakeError('INTAKE_CATALOG_UNAVAILABLE', 503);
	}
}
export async function boundedText(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
	signal?: AbortSignal
): Promise<string> {
	if (!body) throw new IntakeError('INTAKE_BODY_INVALID');
	const reader = body.getReader();
	let size = 0;
	const chunks: Uint8Array[] = [];
	const abort = () => {
		void reader.cancel().catch(() => {});
	};
	signal?.addEventListener('abort', abort, { once: true });
	try {
		while (true) {
			signal?.throwIfAborted();
			const { value, done } = await reader.read();
			signal?.throwIfAborted();
			if (done) break;
			size += value.byteLength;
			if (size > limit) throw new IntakeError('INTAKE_BODY_TOO_LARGE', 413);
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const c of chunks) {
			bytes.set(c, offset);
			offset += c.length;
		}
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} finally {
		signal?.removeEventListener('abort', abort);
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
export class CatalogReader {
	/**
	 * `fresh` skips the cached copy but still stores what it reads: an admin sees a schedule
	 * change at once, and the public pages of that location pick it up with them.
	 */
	constructor(
		private readonly url: string,
		private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
		private readonly cache?: Cache | (() => Promise<Cache>),
		private readonly fresh = false
	) {}
	async read(): Promise<Lesson[]> {
		const url = new URL(this.url);
		if (url.protocol !== 'https:' || url.username || url.password || url.hash)
			throw new IntakeError('INTAKE_CATALOG_UNAVAILABLE', 503);
		const key = new Request(url);
		const cache = typeof this.cache === 'function' ? await this.cache() : this.cache;
		const hit = this.fresh ? undefined : await cache?.match(key);
		if (hit) {
			const age = Date.now() - Number(hit.headers.get('x-intake-cached-at'));
			if (age >= 0 && age < 300_000)
				return parseCatalog(await boundedText(hit.body, 1024 * 1024));
		}
		try {
			const signal = AbortSignal.timeout(5000);
			// Reject all redirects: no request may escape the configured source.
			const response = await this.fetcher(url, { redirect: 'manual', signal });
			if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024)
				throw new Error();
			const html = await boundedText(response.body, 1024 * 1024, signal);
			const lessons = await parseCatalog(html);
			await cache
				?.put(
					key,
					new Response(html, {
						headers: {
							'cache-control': 'public, max-age=300',
							'x-intake-cached-at': String(Date.now()),
						},
					})
				)
				.catch(() => {});
			return lessons;
		} catch {
			throw new IntakeError('INTAKE_CATALOG_UNAVAILABLE', 503);
		}
	}
}
