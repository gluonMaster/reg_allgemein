import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
	hasUnexpectedTextControl,
	isApprovedOperationalEmail,
	requiresTextScan,
} from '../../scripts/release-scan-policy';

describe('release scan text policy', () => {
	it('requires source, config, documentation and generated web text to stay text', () => {
		for (const path of [
			'src/worker.ts',
			'src/routes/+page.svelte',
			'migrations/0014.sql',
			'wrangler.toml',
			'.dev.vars.example',
			'docs/runbook.md',
			'.svelte-kit/cloudflare/worker.js',
		]) {
			expect(requiresTextScan(path), path).toBe(true);
		}
		expect(requiresTextScan('static/logo.png')).toBe(false);
	});

	it('allows normal whitespace but rejects NUL and other raw control bytes', () => {
		expect(hasUnexpectedTextControl(Buffer.from('line one\n\tline two\r\n'))).toBe(false);
		expect(hasUnexpectedTextControl(Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
		expect(hasUnexpectedTextControl(Buffer.from([0x61, 0x1f, 0x62]))).toBe(true);
		expect(hasUnexpectedTextControl(Buffer.from([0x61, 0x7f, 0x62]))).toBe(true);
	});

	it('allowlists only the approved non-personal registration mailbox', () => {
		expect(isApprovedOperationalEmail('registration@kolibri-dresden.de')).toBe(true);
		expect(isApprovedOperationalEmail('Registration@Kolibri-Dresden.de')).toBe(true);
		expect(isApprovedOperationalEmail(['person', 'kolibri-dresden.de'].join('@'))).toBe(false);
		expect(isApprovedOperationalEmail('registration@example.org')).toBe(false);
	});

	it('keeps protected Telegram target and deployment evidence outside Git/release scan', () => {
		for (const path of [
			'imports/telegram-preview-target.json',
			'imports/telegram-preview-deployment-evidence.json',
		]) {
			expect(
				execFileSync('git', ['check-ignore', path], {
					cwd: process.cwd(),
					encoding: 'utf8',
				}).trim()
			).toBe(path);
		}
	});
});
