import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseCatalog } from '$lib/trial-intake/server/catalog.server';

it('accepts the ordinary Python exporter output with matching CTA identities', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'intake-reader-exporter-'));
	try {
		const output = join(dir, 'synthetic.html');
		execFileSync(
			'python',
			['-X', 'utf8', resolve('integrations/schedule-exporter/test_exporter.py')],
			{
				env: { ...process.env, TRIAL_EXPORT_TEST_OUTPUT: output },
				stdio: 'pipe',
			}
		);
		const html = readFileSync(output, 'utf8');
		const lessons = await parseCatalog(html);
		expect(lessons).toHaveLength(2);
		for (const lesson of lessons)
			expect(html).toContain(`https://portal.example.test/probestunde?lesson=${lesson.id}`);
		expect(lessons[0].room).toBe('R3');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
