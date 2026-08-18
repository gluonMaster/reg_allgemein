<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const actionsByClass: Record<
		string,
		Array<{ action: string; reason: string; label: string }>
	> = {
		course_mapping: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
			{
				action: 'exact_catalog_mapping',
				reason: 'exact_mapping_confirmed',
				label: 'Exaktes Katalog-Mapping bestätigen',
			},
		],
		family_identity: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
			{
				action: 'typed_family_correction',
				reason: 'family_correction_verified',
				label: 'Family-Korrektur verifizieren',
			},
		],
		invalid_email: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
			{
				action: 'verified_portal_family_link',
				reason: 'portal_family_link_verified',
				label: 'Portal-Link verifizieren',
			},
		],
		invalid_birth_date: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
			{
				action: 'typed_child_correction',
				reason: 'child_correction_verified',
				label: 'Kind-Korrektur verifizieren',
			},
		],
		price: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
		],
		duration: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
		],
		duplicate_service: [
			{
				action: 'same_service_duplicate',
				reason: 'same_service_confirmed',
				label: 'Dieselbe Leistung (ein Belegungsplatz)',
			},
			{
				action: 'distinct_service_proven',
				reason: 'distinct_service_evidence_confirmed',
				label: 'Getrennte Leistungen nachgewiesen',
			},
		],
		source_consistency: [
			{
				action: 'await_upstream',
				reason: 'upstream_correction_requested',
				label: 'Upstream-Korrektur anfordern',
			},
		],
	};

	function entityLink(entityType: string, entityId: string | null): string | null {
		if (!entityId) return null;
		if (entityType === 'legacy_family') return `/admin/legacy/${entityId}`;
		return entityType === 'legacy_enrollment' ? '/admin/catalog' : null;
	}

	function exportHref(filters: PageData['filters']): string {
		const params = new URLSearchParams();
		for (const [name, value] of [
			['period', filters.periodId],
			['source', filters.sourceKind],
			['class', filters.issueClass],
			['state', filters.state],
			['assignee', filters.assigneeId],
			['firstRun', filters.firstSeenRunId],
			['lastRun', filters.lastSeenRunId],
		] as const) {
			if (value) params.set(name, value);
		}
		const query = params.toString();
		return `/admin/import-reconciliation/export.json${query ? `?${query}` : ''}`;
	}

	let selectedEntityLink = $derived(
		data.selected
			? entityLink(data.selected.item.entityType, data.selected.item.entityId)
			: null
	);
	let exportUrl = $derived(exportHref(data.filters));
</script>

<section class="admin-section">
	<h2>Import-Abgleich</h2>
	<p>PII-freie Arbeitsliste für wiederkehrende Importprobleme und den Release-Gate.</p>
	<p>
		<a href={exportUrl}
			>PII-freie Upstream-Checkliste exportieren</a
		>
	</p>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}

	<div class="admin-list">
		{#each data.queue.summary as item}
			<article class="admin-card">
				<strong>{item.issueClass}</strong>
				<p>{item.state}: {item.count} · blocking: {item.blocking}</p>
			</article>
		{/each}
	</div>

	<form method="GET" class="admin-filter-form">
		<label>Periode <input name="period" value={data.filters.periodId ?? ''} /></label>
		<label
			>Quelle
			<select name="source" value={data.filters.sourceKind ?? ''}>
				<option value="">Alle</option><option value="access">Access</option><option
					value="plusbtext">PlusBText</option
				>
			</select>
		</label>
		<label>Klasse <input name="class" value={data.filters.issueClass ?? ''} /></label>
		<label>Status <input name="state" value={data.filters.state ?? ''} /></label>
		<label>Bearbeiter-ID <input name="assignee" value={data.filters.assigneeId ?? ''} /></label>
		<label>Erster Run <input name="firstRun" value={data.filters.firstSeenRunId ?? ''} /></label
		>
		<label>Letzter Run <input name="lastRun" value={data.filters.lastSeenRunId ?? ''} /></label>
		<button type="submit">Filtern</button>
	</form>

	{#if data.queue.summary.some((item) => item.blocking > 0)}
		<p class="form-status" role="alert">
			Release und Registration bleiben blockiert, solange blocking cases offen sind.
		</p>
	{/if}

	<form method="POST" action="?/batch" class="admin-action-form">
		<input type="hidden" name="_csrf" value={data.csrfToken} />
		<input
			type="hidden"
			name="idempotencyKey"
			value={`${data.commandKey}:reconciliation:batch`}
		/>
		<div class="admin-list">
			{#each data.queue.items as item}
				<article class="admin-card">
					<label class="checkbox"
						><input
							type="checkbox"
							name="case"
							value={`${item.id}|${item.version}`}
						/><span>Batch</span></label
					>
					<h3><a href={`?case=${item.id}`}>{item.issueCode}</a></h3>
					<p>
						{item.periodCode} · {item.sourceKind} · {item.issueClass} · {item.state} · v{item.version}
					</p>
					<p><code>{item.id}</code></p>
					<p>
						first: <code>{item.firstImportRunId}</code> · last:
						<code>{item.lastSeenImportRunId}</code>
					</p>
				</article>
			{/each}
		</div>
		<label
			>Batch-Aktion
			<select name="action">
				<option value="assign">Zuweisen</option>
				<option value="unassign">Zuweisung lösen</option>
				<option value="await_upstream">Upstream angefragt</option>
				<option value="mark_ready_to_verify">Für Reimport-Prüfung bereit</option>
			</select>
		</label>
		<label
			>Reason-Code
			<select name="reasonCode">
				<option value="operator_assignment">operator_assignment</option>
				<option value="operator_unassignment">operator_unassignment</option>
				<option value="upstream_correction_requested">upstream_correction_requested</option>
				<option value="upstream_correction_reported">upstream_correction_reported</option>
			</select>
		</label>
		<label>Bearbeiter-ID <input name="assigneeId" /></label>
		<label class="checkbox"
			><input type="checkbox" name="confirmation" value="confirmed" required /><span
				>Aktion bestätigen</span
			></label
		>
		<button type="submit">Batch anwenden</button>
	</form>

	{#if data.selected}
		<article class="admin-card">
			<h3>Case {data.selected.item.id}</h3>
			<p>
				{data.selected.item.issueCode} · {data.selected.item.issueClass} · {data.selected
					.item.state}
			</p>
			{#if selectedEntityLink}
				<a href={selectedEntityLink}>Autorisierte Detailansicht öffnen</a>
			{/if}
			<form method="POST" action="?/mutate" class="admin-action-form">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="caseId" value={data.selected.item.id} />
				<input type="hidden" name="expectedVersion" value={data.selected.item.version} />
				<input
					type="hidden"
					name="idempotencyKey"
					value={`${data.commandKey}:reconciliation:${data.selected.item.id}`}
				/>
				<label
					>Aktion
					<select name="action">
						<option value="assign">Zuweisen</option>
						<option value="unassign">Zuweisung lösen</option>
						<option value="mark_ready_to_verify">Für Reimport-Prüfung bereit</option>
						{#each actionsByClass[data.selected.item.issueClass] ?? [] as option}
							<option value={option.action}>{option.label}</option>
						{/each}
					</select>
				</label>
				<label>Reason-Code <input name="reasonCode" required /></label>
				<label>Bearbeiter-ID <input name="assigneeId" /></label>
				<label
					>Evidence-Typ
					<select name="targetType"
						><option value=""></option><option value="course_group">course_group</option
						><option value="legacy_family">legacy_family</option><option
							value="legacy_child">legacy_child</option
						><option value="legacy_enrollment">legacy_enrollment</option
						><option value="user">user</option><option value="family_reassignment"
							>family_reassignment</option
						></select
					>
				</label>
				<label>Opaque Evidence-ID <input name="targetId" /></label>
				<label class="checkbox"
					><input type="checkbox" name="confirmation" value="confirmed" required /><span
						>Exakte Wirkung bestätigen</span
					></label
				>
				<button type="submit">Anwenden</button>
			</form>
			<h4>PII-freie Timeline</h4>
			<ul>
				{#each data.selected.timeline as entry}
					<li>
						{entry.createdAt} · {entry.action} · {entry.reasonCode} ·
						<code>{entry.id}</code>
					</li>
				{/each}
			</ul>
		</article>
	{/if}
</section>
