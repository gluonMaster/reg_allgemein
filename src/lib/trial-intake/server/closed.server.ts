import type { DatabaseBoundary } from '$lib/server/db/database';
import type { Lesson } from '../contracts';
import { closedKey } from '../closed';

export { closedKey };
export async function readClosedKeys(db: DatabaseBoundary): Promise<Set<string>> {
	const rows = await db.all<{ match_key: string }>({
		sql: 'SELECT match_key FROM trial_intake_closed_lessons',
	});
	return new Set(rows.results.map((row) => row.match_key));
}
export async function closedLessonIds(
	db: DatabaseBoundary,
	lessons: readonly Lesson[]
): Promise<string[]> {
	const keys = await readClosedKeys(db);
	return lessons.filter((lesson) => keys.has(closedKey(lesson))).map((lesson) => lesson.id);
}
