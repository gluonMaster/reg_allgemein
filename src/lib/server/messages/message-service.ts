import { formatTimestamp } from '$lib/i18n/locale';
import { formatMessage, translate } from '$lib/i18n';
import type { AuthenticatedUser } from '$lib/server/auth/session';
import type { MessagingRuntimeConfig } from '$lib/server/config/runtime';
import type { CabinetReadModelContributor } from '$lib/server/cabinet/cabinet-service';
import { requireParent, type AdminActor } from '$lib/server/security/authorization';
import { isCalendarDate } from '$lib/server/time/berlin';
import { nextBusinessWindow } from '$lib/server/outbox/business-hours';
import {
	absenceSchema,
	adminReplySchema,
	closeThreadSchema,
	createThreadSchema,
	parentMessageSchema,
} from './contracts';
import { MessageRepository, MessageRepositoryError } from './message-repository';

export class MessageServiceError extends Error {
	constructor(readonly code: string, options?: { cause?: unknown }) {
		super(code, options);
		this.name = 'MessageServiceError';
	}
}

function assertInstant(value: string): void {
	if (Number.isNaN(Date.parse(value)) || !value.endsWith('Z')) {
		throw new MessageServiceError('INVALID_UTC_INSTANT');
	}
}

function cleanMultiline(value: string): string {
	return value
		.normalize('NFKC')
		.replace(/\r\n?/gu, '\n')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
		.trim();
}

function cleanSingleLine(value: string): string {
	return cleanMultiline(value).replace(/\s+/gu, ' ');
}

export class MessageService implements CabinetReadModelContributor {
	constructor(
		private readonly repository: MessageRepository,
		private readonly config: Pick<
			MessagingRuntimeConfig,
			'emailMaxAttempts' | 'telegramMaxAttempts' | 'telegramSchedule'
		>,
		private readonly clock: () => string = () => new Date().toISOString()
	) {}

	async contribute(userId: string, locale?: string) {
		return {
			threads: (await this.repository.listOwnerThreads(userId)).slice(0, 10).map((thread) => ({
				id: thread.id,
				label: thread.subject,
				status: thread.status,
				detail: `${translate(locale, `messages.category.${thread.category}`)} · ${formatTimestamp(locale, thread.updatedAt)}`,
				href: `/messages/${thread.publicReference}`,
			})),
		};
	}

	async createThread(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		requireParent(input.actor);
		const parsed = createThreadSchema.safeParse(input.payload);
		if (!parsed.success || parsed.data.category === 'absence') {
			throw new MessageServiceError('INVALID_SUPPORT_THREAD');
		}
		const now = input.now ?? this.clock();
		assertInstant(now);
		return this.repository.createThread({
			threadId: crypto.randomUUID(),
			publicReference: crypto.randomUUID(),
			messageId: crypto.randomUUID(),
			userId: input.actor.id,
			category: parsed.data.category,
			subject: cleanSingleLine(parsed.data.subject),
			body: cleanMultiline(parsed.data.message),
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			notBefore: nextBusinessWindow(now, this.config.telegramSchedule),
			telegramMaxAttempts: this.config.telegramMaxAttempts,
			now,
		});
	}

	async createAbsence(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		requireParent(input.actor);
		const parsed = absenceSchema.safeParse(input.payload);
		if (!parsed.success || !isCalendarDate(parsed.data.absenceDate)) {
			throw new MessageServiceError('INVALID_ABSENCE');
		}
		const now = input.now ?? this.clock();
		assertInstant(now);
		const reason = cleanSingleLine(parsed.data.reason);
		const detail = cleanMultiline(parsed.data.message) || '—';
		return this.repository.createAbsence({
			threadId: crypto.randomUUID(),
			publicReference: crypto.randomUUID(),
			messageId: crypto.randomUUID(),
			absenceId: crypto.randomUUID(),
			userId: input.actor.id,
			childId: parsed.data.childId,
			enrollmentId: parsed.data.enrollmentId,
			absenceDate: parsed.data.absenceDate,
			reason,
			body: formatMessage('de', 'absence.messageFormat', { reason, message: detail }),
			subject: formatMessage('de', 'absence.subject', { date: parsed.data.absenceDate }),
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			notBefore: nextBusinessWindow(now, this.config.telegramSchedule),
			telegramMaxAttempts: this.config.telegramMaxAttempts,
			now,
		});
	}

	async appendParentMessage(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		requireParent(input.actor);
		const parsed = parentMessageSchema.safeParse(input.payload);
		if (!parsed.success) throw new MessageServiceError('INVALID_SUPPORT_MESSAGE');
		const now = input.now ?? this.clock();
		assertInstant(now);
		return this.repository.appendParentMessage({
			publicReference: parsed.data.publicReference,
			messageId: crypto.randomUUID(),
			userId: input.actor.id,
			body: cleanMultiline(parsed.data.message),
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			notBefore: nextBusinessWindow(now, this.config.telegramSchedule),
			telegramMaxAttempts: this.config.telegramMaxAttempts,
			now,
		});
	}

	async closeAsParent(input: {
		actor: AuthenticatedUser;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		requireParent(input.actor);
		const parsed = closeThreadSchema.safeParse(input.payload);
		if (!parsed.success) throw new MessageServiceError('INVALID_SUPPORT_CLOSE');
		const now = input.now ?? this.clock();
		assertInstant(now);
		return this.repository.closeThread({
			actorId: input.actor.id,
			actorKind: 'parent',
			publicReference: parsed.data.publicReference,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
	}

	async replyAsAdmin(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const parsed = adminReplySchema.safeParse(input.payload);
		if (!parsed.success) throw new MessageServiceError('INVALID_ADMIN_REPLY');
		const now = input.now ?? this.clock();
		assertInstant(now);
		return this.repository.replyAsAdmin({
			admin: input.admin,
			publicReference: parsed.data.publicReference,
			messageId: crypto.randomUUID(),
			body: cleanMultiline(parsed.data.message),
			outcome: parsed.data.outcome,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			emailMaxAttempts: this.config.emailMaxAttempts,
			now,
		});
	}

	async closeAsAdmin(input: {
		admin: AdminActor;
		payload: unknown;
		requestId: string;
		now?: string;
	}) {
		const parsed = closeThreadSchema.safeParse(input.payload);
		if (!parsed.success) throw new MessageServiceError('INVALID_SUPPORT_CLOSE');
		const now = input.now ?? this.clock();
		assertInstant(now);
		return this.repository.closeThread({
			actorId: input.admin.id,
			actorKind: 'admin',
			publicReference: parsed.data.publicReference,
			idempotencyKey: parsed.data.idempotencyKey,
			requestId: input.requestId,
			now,
		});
	}
}

export function isMessageConflict(error: unknown): boolean {
	return error instanceof MessageServiceError || error instanceof MessageRepositoryError;
}
