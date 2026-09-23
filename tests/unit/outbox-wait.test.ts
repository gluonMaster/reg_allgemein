import { translateOutboxTemplate, translateOutboxWait } from '$lib/i18n';
import { formatBerlinTime } from '$lib/i18n/locale';
import { outboxWaitReason, type OutboxWaitInput } from '$lib/outbox-wait';

const NOW = '2026-09-23T18:25:01.000Z';
const row = (patch: Partial<OutboxWaitInput>): OutboxWaitInput => ({
	channel: 'telegram',
	status: 'pending',
	attempts: 0,
	notBefore: '2026-09-22T12:11:15.000Z',
	nextAttemptAt: null,
	...patch,
});

describe('admin delivery wording', () => {
	it('shows operational times in Berlin with the zone named, across daylight saving', () => {
		expect(formatBerlinTime('de', '2026-09-22T12:09:08.273Z')).toBe('22.09.2026, 14:09 (Berlin)');
		expect(formatBerlinTime('ru', '2026-09-22T12:09:08.273Z')).toBe('22.09.2026, 14:09 (Берлин)');
		expect(formatBerlinTime('de', '2026-01-15T08:00:00.000Z')).toBe('15.01.2026, 09:00 (Berlin)');
		expect(formatBerlinTime('de', 'not-a-time')).toBe('not-a-time');
	});

	it('names known templates in both languages and keeps unknown codes visible', () => {
		expect(translateOutboxTemplate('ru', 'bureau.trial_intake')).toBe(
			'Уведомление бюро о заявке на пробное занятие'
		);
		expect(translateOutboxTemplate('de', 'bureau.trial_intake')).toBe(
			'Büro-Benachrichtigung über eine Probestunden-Anfrage'
		);
		expect(translateOutboxTemplate('ru', 'auth.verify')).toBe('auth.verify');
	});

	it('explains a send deferred to the business window instead of calling it a failed retry', () => {
		// The production row after the admin decision: deferred at 20:25 Berlin, no attempt made.
		const deferred = row({
			status: 'retry',
			notBefore: '2026-09-24T07:00:00.000Z',
			nextAttemptAt: '2026-09-24T07:00:00.000Z',
		});
		expect(outboxWaitReason(deferred, NOW)).toEqual({
			kind: 'business_hours',
			at: '2026-09-24T07:00:00.000Z',
		});
		expect(translateOutboxWait('ru', outboxWaitReason(deferred, NOW)!)).toBe(
			'Ждёт рабочего времени бюро: отправка не раньше 24.09.2026, 09:00 (Берлин).'
		);
		expect(
			outboxWaitReason(row({ notBefore: '2026-09-24T07:00:00.000Z' }), NOW)
		).toMatchObject({ kind: 'business_hours' });
	});

	it('names the ambiguous message that holds a row back before any time-based reason', () => {
		const blocked = outboxWaitReason(row({ blockedByReference: 'TG-6E0F131BA26B' }), NOW)!;
		expect(blocked).toEqual({ kind: 'unknown_decision', reference: 'TG-6E0F131BA26B' });
		expect(translateOutboxWait('ru', blocked, true)).toBe(
			'Ждёт вашего решения по сообщению TG-6E0F131BA26B той же заявки: его доставка не подтверждена.'
		);
		expect(translateOutboxWait('de', blocked)).toContain('TG-6E0F131BA26B');
	});

	it('does not promise a Telegram send while a terminal failure stops the whole lane', () => {
		expect(outboxWaitReason(row({}), NOW, true)).toEqual({ kind: 'lane_stopped' });
		expect(translateOutboxWait('ru', { kind: 'lane_stopped' })).toBe(
			'Отправка в Telegram остановлена: недоставленное сообщение ждёт вашего решения.'
		);
		expect(outboxWaitReason(row({ channel: 'email' }), NOW, true)).toEqual({ kind: 'due' });
		expect(
			outboxWaitReason(row({ blockedByReference: 'TG-6E0F131BA26B' }), NOW, true)
		).toMatchObject({ kind: 'unknown_decision' });
	});

	it('distinguishes a due row, a provider backoff, a scheduled e-mail and terminal states', () => {
		expect(outboxWaitReason(row({}), NOW)).toEqual({ kind: 'due' });
		expect(
			outboxWaitReason(
				row({ status: 'retry', attempts: 2, nextAttemptAt: '2026-09-23T18:30:00.000Z' }),
				NOW
			)
		).toEqual({ kind: 'backoff', at: '2026-09-23T18:30:00.000Z' });
		expect(
			outboxWaitReason(row({ channel: 'email', notBefore: '2026-09-23T19:00:00.000Z' }), NOW)
		).toEqual({ kind: 'scheduled', at: '2026-09-23T19:00:00.000Z' });
		for (const status of ['sent', 'processing', 'dead', 'cancelled', 'delivery_unknown'])
			expect(outboxWaitReason(row({ status }), NOW)).toBeUndefined();
	});
});
