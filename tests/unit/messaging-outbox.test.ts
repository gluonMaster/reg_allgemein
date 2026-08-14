import { describe, expect, it } from 'vitest';
import { parseBusinessHours, nextBusinessWindow } from '$lib/server/outbox/business-hours';
import type { EmailOutboxRow, TelegramOutboxRow } from '$lib/server/outbox/contracts';
import { deterministicRetryAt } from '$lib/server/outbox/outbox-worker';
import {
	EMAIL_TEMPLATE_IDS,
	renderEmailTemplate,
	renderTelegramTemplate,
} from '$lib/server/outbox/templates';

const schedule = parseBusinessHours('Europe/Berlin', 'Mo-Fr 09:00-17:00');
const portal = { portalPublicOrigin: 'https://portal.example.test' };

function emailRow(template: string, payload: Record<string, unknown>): EmailOutboxRow {
	return {
		id: `email:${template}`,
		source_kind: 'fixture',
		source_id: 'fixture-1',
		template_or_category: template,
		recipient_address_kind: 'current',
		locale: 'de',
		payload_json: JSON.stringify(payload),
		dedupe_key: `dedupe:${template}`,
		attempts: 0,
		max_attempts: 5,
		email: 'parent@example.test',
		token_id: null,
		token_kind: null,
		user_id: 'parent-1',
		lease_owner: 'fixture-worker',
	};
}

describe('stage 11 business-hours scheduling', () => {
	it('keeps deliveries inside the Berlin weekday window and defers early or weekend work', () => {
		expect(nextBusinessWindow('2026-07-21T08:00:00.000Z', schedule))
			.toBe('2026-07-21T08:00:00.000Z');
		expect(nextBusinessWindow('2026-07-21T06:00:00.000Z', schedule))
			.toBe('2026-07-21T07:00:00.000Z');
		expect(nextBusinessWindow('2026-07-25T10:00:00.000Z', schedule))
			.toBe('2026-07-27T07:00:00.000Z');
	});

	it('uses the correct offset across both Berlin DST boundaries', () => {
		expect(nextBusinessWindow('2026-03-27T16:30:00.000Z', schedule))
			.toBe('2026-03-30T07:00:00.000Z');
		expect(nextBusinessWindow('2026-10-23T15:30:00.000Z', schedule))
			.toBe('2026-10-26T08:00:00.000Z');
	});
});

describe('stage 11 outbox contracts', () => {
	it('uses deterministic bounded exponential retry timing', () => {
		const timing = { retryBaseSeconds: 60, retryMaxSeconds: 300 };
		expect(deterministicRetryAt('2026-07-22T10:00:00.000Z', 1, timing))
			.toBe('2026-07-22T10:01:00.000Z');
		expect(deterministicRetryAt('2026-07-22T10:00:00.000Z', 4, timing))
			.toBe('2026-07-22T10:05:00.000Z');
	});

	it('renders every non-token parent template in German with portal-origin links', async () => {
		const fixture = {
			portalPath: '/cabinet',
			confirmedDate: '2026-08-03',
			status: 'approved',
			contractNumber: 'K-100',
			reference: 'REF-100',
			kind: 'ordinary',
			receivedAt: '2026-07-22T10:00:00.000Z',
			childName: 'Beispielkind',
			captureScopes: ['photo'],
			publicationChannels: ['print'],
			sourceChannel: 'portal',
			oldPriceCents: 4000,
			newPriceCents: 4500,
			responseDeadline: '2026-08-15',
			effectiveFrom: '2026-09-01',
			threadReference: 'MSG-100',
		};
		const tokenTemplates = new Set([
			'auth.email_verification',
			'auth.email_change_verification',
			'auth.password_reset',
			'claim.legacy_email_proof',
		]);
		for (const template of EMAIL_TEMPLATE_IDS.filter((id) => !tokenTemplates.has(id))) {
			const message = await renderEmailTemplate({ row: emailRow(template, fixture), config: portal });
			expect(message.to).toBe('parent@example.test');
			expect(message.subject.length).toBeGreaterThan(3);
			expect(message.text).not.toContain('undefined');
			if (message.text.includes('https://')) {
				expect(message.text).toContain('https://portal.example.test/');
				expect(message.text).not.toContain('kolibri-dresden.de');
			}
		}
	});

	it('renders only minimized bureau metadata for Telegram', async () => {
		const reference = '11111111-1111-4111-8111-111111111111';
		const row: TelegramOutboxRow = {
			id: 'telegram-1', source_kind: 'support_thread', source_id: reference,
			template_or_category: 'bureau.support', destination_ref: 'bureau', locale: 'de',
			payload_json: JSON.stringify({
				category: 'technical', reference,
				receivedAt: '2026-07-22T10:00:00.000Z', adminPath: `/admin/messages/${reference}`,
			}),
			dedupe_key: 'telegram:thread-1:v1', attempts: 0, max_attempts: 5,
			lease_owner: 'fixture-worker',
		};
		const message = await renderTelegramTemplate({ row, config: portal, chatId: 'bureau-chat' });
		expect(message.chatId).toBe('bureau-chat');
		expect(message.deliveryReference).toMatch(/^TG-[A-F0-9]{12}$/u);
		expect(message.text).toContain(message.deliveryReference);
		expect(message.text).toContain(reference);
		expect(message.text).toContain(`https://portal.example.test/admin/messages/${reference}`);
		for (const forbidden of ['parent@example.test', '+4912345', 'Freitext', 'token=']) {
			expect(message.text).not.toContain(forbidden);
		}
	});

	it('rejects non-minimized or mismatched Telegram payloads before provider dispatch', async () => {
		const reference = '11111111-1111-4111-8111-111111111111';
		const base: TelegramOutboxRow = {
			id: 'telegram-invalid', source_kind: 'support_thread', source_id: reference,
			template_or_category: 'bureau.support', destination_ref: 'bureau', locale: 'de',
			payload_json: '', dedupe_key: 'telegram:invalid:v1', attempts: 0, max_attempts: 5,
			lease_owner: 'fixture-worker',
		};
		const valid = {
			category: 'technical', reference, receivedAt: '2026-07-22T10:00:00.000Z',
			adminPath: `/admin/messages/${reference}`,
		};
		for (const payload of [
			{ ...valid, freeText: 'parent@example.test' },
			{ ...valid, reference: 'parent@example.test', adminPath: '/admin/messages/parent@example.test' },
			{ ...valid, category: 'Parent Name' },
			{ ...valid, receivedAt: '2026-07-22 10:00:00' },
			{ ...valid, adminPath: `${valid.adminPath}?token=secret` },
			{ ...valid, adminPath: '/admin/messages/22222222-2222-4222-8222-222222222222' },
		]) {
			await expect(renderTelegramTemplate({
				row: { ...base, payload_json: JSON.stringify(payload) }, config: portal,
				chatId: 'bureau-chat',
			})).rejects.toMatchObject({ code: 'TELEGRAM_PAYLOAD_NOT_MINIMIZED' });
		}
	});
});
