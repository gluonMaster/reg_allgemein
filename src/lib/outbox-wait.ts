/** Why a queued message has not been sent yet; shown to the admin instead of a bare status. */
export type OutboxWaitReason =
	| { kind: 'unknown_decision'; reference: string }
	| { kind: 'lane_stopped' }
	| { kind: 'business_hours'; at: string }
	| { kind: 'scheduled'; at: string }
	| { kind: 'backoff'; at: string }
	| { kind: 'due' };

export interface OutboxWaitInput {
	channel: 'email' | 'telegram';
	status: string;
	attempts: number;
	notBefore: string;
	nextAttemptAt: string | null;
	blockedByReference?: string;
	sourceKind?: string;
}

/**
 * `laneStopped`: a terminal Telegram failure stops every send until an admin decides, except
 * trial-intake notifications, which wait only for their own request.
 */
export function outboxWaitReason(
	row: OutboxWaitInput,
	now: string,
	laneStopped = false
): OutboxWaitReason | undefined {
	if (row.status !== 'pending' && row.status !== 'retry') return undefined;
	if (row.blockedByReference) return { kind: 'unknown_decision', reference: row.blockedByReference };
	if (row.channel === 'telegram' && laneStopped && row.sourceKind !== 'trial_intake')
		return { kind: 'lane_stopped' };
	const at =
		row.nextAttemptAt && Date.parse(row.nextAttemptAt) > Date.parse(row.notBefore)
			? row.nextAttemptAt
			: row.notBefore;
	if (!(Date.parse(at) > Date.parse(now))) return { kind: 'due' };
	// Telegram waits for the bureau business window, both when queued and again at send time.
	// A deferral at send time turns the row into `retry` without an attempt; it is not a failure.
	if (row.channel === 'telegram' && (row.status === 'pending' || row.attempts === 0))
		return { kind: 'business_hours', at };
	return row.attempts === 0 ? { kind: 'scheduled', at } : { kind: 'backoff', at };
}
