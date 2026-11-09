<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatEuro } from '$lib/i18n/locale';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import {
		t,
		attentionReasonsText,
		dayLabel,
		differenceText,
		entryStatusText,
		errorKey,
		fill,
		formatDate,
		formatTimestamp,
		importReasonKey,
		rebindKindText,
		startBlockText,
		tariffLabel,
		waitlistMarkTexts,
		waitlistStatusText,
		type TextKey,
	} from '../i18n';
	import { centsText, euroAmount, MIN_PARTICIPANTS_DEFAULT } from '../prices';
	import { requestJson } from '../client';
	import WaitlistStartDialog from './WaitlistStartDialog.svelte';
	import WaitlistRebindDialog from './WaitlistRebindDialog.svelte';
	import type {
		AdminWaitlistData,
		CourseSummary,
		WaitlistCourse,
		WaitlistEntrySummary,
		WaitlistImportOutcome,
		WaitlistImportPreview,
		WaitlistPriceChange,
	} from '../contracts';
	import '../intake.css';
	let { data }: { data: AdminWaitlistData & { csrfToken: string } } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	type Field = 'monthly' | 'yearly' | 'min';
	let busy = $state(false),
		enhanced = $state(false),
		feedback = $state<string | null>(null),
		notice = $state<string | null>(null),
		preview = $state<WaitlistImportPreview | null>(null),
		fileInput = $state<HTMLInputElement>();
	// The course whose start dialog is open (WL-10).
	let starting = $state<string | null>(null);
	const startCourse = $derived(data.courses.find((course) => course.key === starting));
	// The course whose rebind tool is open and the course asked to reopen (WL-15).
	let rebinding = $state<string | null>(null),
		reopening = $state<string | null>(null);
	const rebindCourse = $derived(data.unscheduled.find((course) => course.key === rebinding));
	// Only what the admin typed; everything else shows the stored values.
	let edits = $state<Record<string, Partial<Record<Field, string>>>>({});
	onMount(() => {
		enhanced = true;
	});
	function value(course: WaitlistCourse, field: Field): string {
		const typed = edits[course.key]?.[field];
		if (typed !== undefined) return typed;
		if (field === 'min')
			return String(course.price?.minParticipants ?? MIN_PARTICIPANTS_DEFAULT);
		const cents = course.price?.[field === 'monthly' ? 'monthlyCents' : 'yearlyCents'];
		return cents === undefined ? '' : centsText(cents);
	}
	function edit(course: WaitlistCourse, field: Field, text: string) {
		edits[course.key] = { ...edits[course.key], [field]: text };
	}
	async function send<T>(url: string, body: Record<string, unknown>, reload = true) {
		busy = true;
		feedback = notice = null;
		try {
			const result = await requestJson<T>(url, { ...body, _csrf: data.csrfToken });
			if (reload) await invalidateAll();
			return result;
		} catch (e) {
			feedback = t(locale, errorKey(e instanceof Error ? e.message : ''));
			// A refused price shows its lock after the reload.
			await invalidateAll();
			return null;
		} finally {
			busy = false;
		}
	}
	async function save(course: WaitlistCourse) {
		const result = await send('/admin/trial-intake/warteliste', {
			lessonId: course.lessons[0].id,
			monthly: value(course, 'monthly'),
			yearly: value(course, 'yearly'),
			minParticipants: value(course, 'min'),
		});
		if (result) {
			delete edits[course.key];
			notice = t(locale, 'saved');
		}
	}
	async function remove(course: WaitlistCourse) {
		await send('/admin/trial-intake/warteliste', { key: course.key, delete: true });
	}
	async function upload() {
		const file = fileInput?.files?.[0];
		if (!file) return;
		if (file.size > 256 * 1024) {
			feedback = t(locale, 'importFileTooLarge');
			return;
		}
		let binary = '';
		for (const byte of new Uint8Array(await file.arrayBuffer()))
			binary += String.fromCharCode(byte);
		preview = await send<WaitlistImportPreview>(
			'/admin/trial-intake/warteliste/import',
			{ fileName: file.name, content: btoa(binary) },
			false
		);
	}
	async function apply() {
		if (!preview) return;
		const result = await send<{ applied: number }>('/admin/trial-intake/warteliste/import', {
			action: 'apply',
			changes: preview.changes,
		});
		if (result) {
			preview = null;
			if (fileInput) fileInput.value = '';
			notice = fill(t(locale, 'priceImportApplied'), { n: result.applied });
		}
	}
	const outcomeKey: Record<WaitlistImportOutcome, TextKey> = {
		new: 'importNew',
		change: 'importChange',
		same: 'importSame',
		locked: 'importLocked',
		unknown: 'importUnknown',
		error: 'importError',
	};
	const amounts = (values: Omit<WaitlistPriceChange, 'key'> | null) =>
		values
			? `${formatEuro(locale, values.monthlyCents)} / ${formatEuro(locale, values.yearlyCents)} · ${values.minParticipants}`
			: '—';
	const lock = (course: WaitlistCourse) =>
		course.activeEntries > 0
			? fill(t(locale, 'priceLocked'), { n: course.activeEntries })
			: '—';
	const label = (course: WaitlistCourse, column: string) =>
		`${column}: ${course.course.subject}, ${dayLabel(course.course.weekday, locale)} ${course.course.start}`;
	/** WL-15: "Familien informiert", a price decision of the red mark, "Als neuen Kurs öffnen". */
	async function informed(course: WaitlistCourse) {
		if (
			await send('/admin/trial-intake/warteliste/attention', {
				action: 'informed',
				key: course.key,
			})
		)
			notice = t(locale, 'saved');
	}
	async function decide(entry: WaitlistEntrySummary, action: 'confirmed' | 'declined') {
		if (
			await send('/admin/trial-intake/warteliste/attention', {
				action,
				requestId: entry.requestId,
			})
		)
			notice = t(locale, 'saved');
	}
	async function reopen(course: WaitlistCourse) {
		if (await send('/admin/trial-intake/warteliste/reopen', { key: course.key })) {
			reopening = null;
			notice = t(locale, 'saved');
		}
	}
	const summary = (c: CourseSummary) =>
		`${c.subject}, ${dayLabel(c.weekday, locale)} ${c.start}–${c.end}, ${c.building} · ${t(locale, 'room')} ${c.room}, ${c.teacher}`;
	const familyName = (entry: WaitlistEntrySummary) =>
		`${entry.parentFirstName} ${entry.parentLastName}`;
	const decisionText = (entry: WaitlistEntrySummary) =>
		entry.priceDecision &&
		fill(
			t(
				locale,
				entry.priceDecision.decision === 'confirmed'
					? 'decisionConfirmed'
					: 'decisionDeclined'
			),
			{
				amount: euroAmount(entry.priceDecision.priceCents ?? 0),
				date: formatDate(entry.priceDecision.createdAt, locale),
			}
		);
</script>

<svelte:head><title>{t(locale, 'adminWaitlist')} · {ORGANIZATION_NAME}</title></svelte:head>
{#snippet place(course: WaitlistCourse)}
	<td>
		<strong>{course.course.subject}</strong><br /><span class="muted"
			>{t(locale, 'plannedLabel')}</span
		>
	</td>
	<td>{dayLabel(course.course.weekday, locale)}</td>
	<td>{course.course.start}–{course.course.end}</td>
	<td>{course.course.building} · {t(locale, 'room')} {course.course.room}</td>
	<td>{course.course.teacher}</td>
{/snippet}
{#snippet status(course: WaitlistCourse)}
	{@const marks = waitlistMarkTexts(course, locale)}
	<td>
		{waitlistStatusText(course, locale) || '—'}
		{#if course.unconfirmedChildren > 0}<br /><span class="muted"
				>{fill(t(locale, 'unconfirmed'), { n: course.unconfirmedChildren })}</span
			>{/if}
		{#if course.status === 'ambiguous'}<br /><span class="muted"
				>{t(locale, 'adminWaitlistAmbiguous')}</span
			>{/if}
		{#if course.status === 'started' && course.lessons.length}<br /><span class="muted"
				>{t(locale, 'statusRenameHint')}</span
			>{/if}
		{#if marks.orange}<br /><span class="mark mark-orange">{marks.orange}</span>{/if}
		{#if marks.red}<br /><span class="mark mark-red">{marks.red}</span>{/if}
	</td>
	<td>{lock(course)}</td>
{/snippet}
{#snippet reopenAction(course: WaitlistCourse)}
	<!-- WL-15: a started course takes a new group only after an explicit confirmation. -->
	{#if course.status === 'started'}
		{#if reopening === course.key}<p class="muted">{t(locale, 'reopenHint')}</p>
			<button
				class="primary"
				type="button"
				disabled={busy || !enhanced}
				onclick={() => reopen(course)}>{t(locale, 'reopenConfirm')}</button
			>
			<button type="button" onclick={() => (reopening = null)}>{t(locale, 'cancel')}</button>
		{:else}<button
				type="button"
				disabled={busy || !enhanced}
				onclick={() => (reopening = course.key)}>{t(locale, 'reopenCourse')}</button
			>{/if}
	{/if}
{/snippet}
{#snippet entries(course: WaitlistCourse)}
	<!-- WL-07: the confirmed signups of the course with a link to each card; WL-15: its marks. -->
	{@const waiting = (course.entries ?? []).filter((e) => e.status === 'waiting')}
	{@const open = waiting.filter((e) => course.priceOpen.includes(e.requestId))}
	{#if course.entries?.length || course.attention?.length || course.rebinds?.length}<tr
			class="waitlist-entries"
		>
			<td colspan="11">
				{#if course.attention?.length}<div class="mark-box mark-orange">
						<strong>{t(locale, 'attentionTitle')}</strong>
						<p>
							{fill(t(locale, 'attentionHint'), {
								reasons: attentionReasonsText(course.attention, locale),
							})}
						</p>
						<ul>
							{#each waiting as entry (entry.requestId)}<li>
									{familyName(entry)} · {t(locale, 'phone')}: {entry.phone}
								</li>{/each}
						</ul>
						<button
							type="button"
							disabled={busy || !enhanced}
							onclick={() => informed(course)}>{t(locale, 'attentionDone')}</button
						>
					</div>{/if}
				{#if open.length && course.priceRebind}<div class="mark-box mark-red">
						<strong>{t(locale, 'priceOpenTitle')}</strong>
						<p>
							{fill(t(locale, 'priceOpenHint'), {
								minutes: course.priceRebind.minutes,
								amounts: `${tariffLabel('monthly', locale)} ${formatEuro(locale, course.priceRebind.monthlyCents)}, ${tariffLabel('yearly', locale)} ${formatEuro(locale, course.priceRebind.yearlyCents)}`,
							})}
						</p>
						<ul>
							{#each open as entry (entry.requestId)}<li>
									{familyName(entry)} · {tariffLabel(entry.tariff, locale)} · {t(
										locale,
										'phone'
									)}: {entry.phone}
									<span class="actions"
										><button
											type="button"
											aria-label={`${t(locale, 'priceConfirmedAction')}: ${familyName(entry)}`}
											disabled={busy || !enhanced}
											onclick={() => decide(entry, 'confirmed')}
											>{t(locale, 'priceConfirmedAction')}</button
										><button
											type="button"
											aria-label={`${t(locale, 'priceDeclinedAction')}: ${familyName(entry)}`}
											disabled={busy || !enhanced}
											onclick={() => decide(entry, 'declined')}
											>{t(locale, 'priceDeclinedAction')}</button
										></span
									>
								</li>{/each}
						</ul>
					</div>{/if}
				{#if course.rebinds?.length}<details>
						<summary>{t(locale, 'rebindJournal')} ({course.rebinds.length})</summary>
						<ul>
							{#each course.rebinds as record (record.id)}<li>
									{formatTimestamp(record.createdAt, locale)}: {summary(
										record.from
									)} → {summary(record.to)} · {rebindKindText(
										record.kind,
										locale
									)}
									{#if record.differences.length}<br /><span class="muted"
											>{record.differences
												.map((d) => differenceText(d, locale))
												.join('; ')}</span
										>{/if}
								</li>{/each}
						</ul>
					</details>{/if}
				{#if course.entries?.length}<details open>
						<summary
							>{t(locale, 'adminWaitlistEntries')} ({course.entries.length})</summary
						>
						<ul>
							{#each course.entries as entry (entry.requestId)}<li>
									<a href={`/admin/trial-intake/${entry.requestId}`}
										>{familyName(entry)}</a
									>
									· {entry.children
										.map((c) => `${c.firstName} ${c.lastName}`)
										.join(', ')}
									· {tariffLabel(entry.tariff, locale)} · {t(locale, 'confirmed')}
									{formatTimestamp(entry.verifiedAt, locale)} ·
									<strong>{entryStatusText(entry.status, locale)}</strong>
									{#if entry.priceDecision}· {decisionText(entry)}{/if}
								</li>{/each}
						</ul>
					</details>{/if}
			</td>
		</tr>{/if}
{/snippet}
<section class="intake">
	<h2>{t(locale, 'adminWaitlist')}</h2>
	<p>{t(locale, 'adminWaitlistIntro')}</p>
	{#if feedback}<p class="error" role="alert">{feedback}</p>{/if}
	{#if notice}<p class="card highlight" role="status">{notice}</p>{/if}
	{#if data.catalogError}<p class="card" role="status">
			{t(locale, 'adminWaitlistCatalogError')}
		</p>
	{:else if !data.courses.length}<p class="card">{t(locale, 'adminWaitlistNone')}</p>
	{:else}
		<div class="card table-scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">{t(locale, 'subject')}</th>
						<th scope="col">{t(locale, 'day')}</th>
						<th scope="col">{t(locale, 'time')}</th>
						<th scope="col">{t(locale, 'building')} · {t(locale, 'room')}</th>
						<th scope="col">{t(locale, 'teacher')}</th>
						<th scope="col">{t(locale, 'monthlyContract')}</th>
						<th scope="col">{t(locale, 'yearlyContract')}</th>
						<th scope="col">{t(locale, 'minParticipants')}</th>
						<th scope="col">{t(locale, 'waitlistStatus')}</th>
						<th scope="col">{t(locale, 'priceLockColumn')}</th>
						<th scope="col"><span class="visually-hidden">{t(locale, 'save')}</span></th
						>
					</tr>
				</thead>
				<tbody>
					{#each data.courses as course (course.key)}
						<tr>
							{@render place(course)}
							{#each [['monthly', 'monthlyContract'], ['yearly', 'yearlyContract']] as const as [field, column] (field)}
								<td>
									<input
										class="amount"
										inputmode="decimal"
										autocomplete="off"
										aria-label={label(course, t(locale, column))}
										value={value(course, field)}
										disabled={busy || !enhanced || course.activeEntries > 0}
										oninput={(event) =>
											edit(course, field, event.currentTarget.value)}
									/>
								</td>
							{/each}
							<td>
								<input
									class="amount"
									type="number"
									min="1"
									max="30"
									aria-label={label(course, t(locale, 'minParticipants'))}
									value={value(course, 'min')}
									disabled={busy || !enhanced}
									oninput={(event) =>
										edit(course, 'min', event.currentTarget.value)}
								/>
							</td>
							{@render status(course)}
							<td>
								<button
									type="button"
									disabled={busy || !enhanced}
									onclick={() => save(course)}>{t(locale, 'save')}</button
								>
								{#if course.start}{@const options = course.start}
									{#if !options.start}<button
											class="primary"
											type="button"
											disabled={!enhanced}
											onclick={() => (starting = course.key)}
											>{t(locale, 'startCourse')}</button
										>
									{:else}
										{#if options.start !== 'started'}<span class="muted"
												>{fill(t(locale, 'startBlocked'), {
													reason: startBlockText(options.start, locale),
												})}</span
											>{/if}
										{#if !options.probe}<button
												type="button"
												disabled={!enhanced}
												onclick={() => (starting = course.key)}
												>{t(locale, 'startProbeOpen')}</button
											>{/if}
									{/if}
								{/if}
								{@render reopenAction(course)}
							</td>
						</tr>
						{@render entries(course)}
					{/each}
				</tbody>
			</table>
		</div>
		{#if startCourse?.start}{#key startCourse.key}<WaitlistStartDialog
					course={startCourse}
					options={startCourse.start}
					csrfToken={data.csrfToken}
					{locale}
					onclose={() => (starting = null)}
				/>{/key}{/if}
	{/if}
	{#if data.unscheduled.length}
		<div class="card">
			<h3>
				{data.catalogError
					? t(locale, 'adminWaitlistStored')
					: t(locale, 'adminWaitlistUnscheduled')}
			</h3>
			{#if !data.catalogError}<p class="muted">
					{t(locale, 'adminWaitlistUnscheduledIntro')}
				</p>{/if}
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">{t(locale, 'subject')}</th>
							<th scope="col">{t(locale, 'day')}</th>
							<th scope="col">{t(locale, 'time')}</th>
							<th scope="col">{t(locale, 'building')} · {t(locale, 'room')}</th>
							<th scope="col">{t(locale, 'teacher')}</th>
							<th scope="col">{t(locale, 'monthlyContract')}</th>
							<th scope="col">{t(locale, 'yearlyContract')}</th>
							<th scope="col">{t(locale, 'minParticipants')}</th>
							<th scope="col">{t(locale, 'waitlistStatus')}</th>
							<th scope="col">{t(locale, 'priceLockColumn')}</th>
							<th scope="col"
								><span class="visually-hidden">{t(locale, 'deletePrice')}</span></th
							>
						</tr>
					</thead>
					<tbody>
						{#each data.unscheduled as course (course.key)}
							<tr>
								{@render place(course)}
								<td
									>{course.price
										? formatEuro(locale, course.price.monthlyCents)
										: '—'}</td
								>
								<td
									>{course.price
										? formatEuro(locale, course.price.yearlyCents)
										: '—'}</td
								>
								<td>{course.price?.minParticipants ?? '—'}</td>
								{@render status(course)}
								<td>
									{#if course.rebind}<button
											class={course.rebind.queue ? 'primary' : undefined}
											type="button"
											disabled={busy || !enhanced}
											onclick={() => (rebinding = course.key)}
											>{t(locale, 'rebindOpen')}</button
										>{/if}
									{#if course.price}<button
											type="button"
											disabled={busy || !enhanced || course.activeEntries > 0}
											onclick={() => remove(course)}
											>{t(locale, 'deletePrice')}</button
										>{/if}
									{@render reopenAction(course)}
								</td>
							</tr>
							{@render entries(course)}
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		{#if rebindCourse?.rebind}{#key rebindCourse.key}<WaitlistRebindDialog
					course={rebindCourse}
					options={rebindCourse.rebind}
					csrfToken={data.csrfToken}
					{locale}
					ondone={async (rebound) => {
						rebinding = null;
						await invalidateAll();
						notice = t(locale, rebound ? 'rebindDone' : 'rebindRepeat');
					}}
					onclose={() => (rebinding = null)}
				/>{/key}{/if}
	{/if}
	<div class="card">
		<h3>{t(locale, 'priceExport')}</h3>
		<div class="actions">
			<a
				class="button"
				href="/admin/trial-intake/warteliste/preise.csv"
				download
				data-sveltekit-reload>CSV</a
			>
			<a
				class="button"
				href="/admin/trial-intake/warteliste/preise.xlsx"
				download
				data-sveltekit-reload>XLSX</a
			>
		</div>
	</div>
	<div class="card">
		<h3>{t(locale, 'priceImport')}</h3>
		<p class="muted">{t(locale, 'priceImportHint')}</p>
		<label
			>{t(locale, 'priceImportFile')}<input
				bind:this={fileInput}
				type="file"
				accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				disabled={busy || !enhanced}
				onchange={() => (preview = null)}
			/></label
		>
		<div class="actions">
			<button type="button" disabled={busy || !enhanced} onclick={upload}
				>{t(locale, 'priceImportPreview')}</button
			>
		</div>
		{#if preview}
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">{t(locale, 'importLine')}</th>
							<th scope="col">{t(locale, 'subject')}</th>
							<th scope="col">{t(locale, 'day')}</th>
							<th scope="col">{t(locale, 'time')}</th>
							<th scope="col">{t(locale, 'building')}</th>
							<th scope="col">{t(locale, 'teacher')}</th>
							<th scope="col">{t(locale, 'importResult')}</th>
							<th scope="col">{t(locale, 'importBefore')}</th>
							<th scope="col">{t(locale, 'importAfter')}</th>
						</tr>
					</thead>
					<tbody>
						{#each preview.rows as row (row.line)}
							<tr>
								<td>{row.line}</td>
								<td>{row.cells.fach}</td>
								<td>{row.cells.wochentag}</td>
								<td>{row.cells.uhrzeit}</td>
								<td>{row.cells.gebaeude}</td>
								<td>{row.cells.lehrkraft}</td>
								<td>
									{t(locale, outcomeKey[row.outcome])}
									{#if row.outcome === 'error'}<br /><span class="muted"
											>{t(locale, importReasonKey(row.reason))}</span
										>{/if}
								</td>
								<td>{amounts(row.before)}</td>
								<td>{amounts(row.change)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="actions">
				{#if preview.changes.length}<button
						class="primary"
						type="button"
						disabled={busy || !enhanced}
						onclick={apply}>{t(locale, 'apply')}</button
					>
				{:else}<p class="muted">{t(locale, 'priceImportNothing')}</p>{/if}
			</div>
		{/if}
	</div>
</section>
