<script lang="ts">
	import { translate, translateAdminCode } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<section class="admin-section">
	<a href="/admin/users">← {translate('de', 'admin.users.title')}</a>
	<h2>{data.user.first_name} {data.user.last_name}</h2>
	{#if form?.message}<p class="form-status" aria-live="polite">{form.message}</p>{/if}
	<p class="sensitive-notice">{translate('de', 'admin.users.detailNotice')}</p>
	<dl class="admin-detail-grid">
		<div>
			<dt>{translate('de', 'auth.emailLabel')}</dt>
			<dd>{data.user.email}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.phone')}</dt>
			<dd>{data.user.phone ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.familyId')}</dt>
			<dd>{data.user.family_display_id ?? '—'}</dd>
		</div>
		<div>
			<dt>{translate('de', 'admin.status')}</dt>
			<dd>
				{translateAdminCode('de', data.user.account_status)}{data.user.is_blocked
					? ` · ${translateAdminCode('de', 'blocked')}`
					: ''}
			</dd>
		</div>
	</dl>

	<section class="admin-card danger-card">
		<h3>
			{translate('de', data.user.is_blocked ? 'admin.users.unblock' : 'admin.users.block')}
		</h3>
		<form method="POST" action="?/setBlocked" class="admin-action-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<input type="hidden" name="blocked" value={data.user.is_blocked ? 'false' : 'true'} />
			<input type="hidden" name="idempotencyKey" value={`${data.commandKey}:block`} />
			<label for="block-reason">{translate('de', 'admin.reason')}</label>
			<textarea id="block-reason" name="reason" required maxlength="1000"></textarea>
			<label class="checkbox"
				><input type="checkbox" name="confirmation" value="confirmed" required /><span
					>{translate('de', 'admin.confirmAction')}</span
				></label
			>
			<button type="submit"
				>{translate(
					'de',
					data.user.is_blocked ? 'admin.users.unblock' : 'admin.users.block'
				)}</button
			>
		</form>
	</section>

	<h3>{translate('de', 'admin.children')}</h3>
	<ul>
		{#each data.user.children as child}<li>
				{child.full_name} · {child.birth_date} · {child.family_display_id} · {child.origin}
			</li>{/each}
	</ul>

	<section class="admin-card danger-card">
		<h3>{translate('de', 'admin.family.title')}</h3>
		<p>{translate('de', 'admin.family.warning')}</p>
		<form class="filter-bar" method="GET">
			<label for="family-q">{translate('de', 'admin.family.searchDestination')}</label>
			<input
				id="family-q"
				name="familyQ"
				value={data.familyQuery}
				minlength="2"
				maxlength="160"
			/>
			<button type="submit">{translate('de', 'admin.search')}</button>
		</form>
		<form method="POST" action="?/previewFamilyCorrection" class="admin-action-form">
			<input type="hidden" name="_csrf" value={data.csrfToken} />
			<fieldset>
				<legend>{translate('de', 'admin.family.destination')}</legend>
				<label class="radio"
					><input
						type="radio"
						name="destination"
						value="portal_allocated"
						required
					/><span>{translate('de', 'admin.family.newPortalDestination')}</span></label
				>
				{#each data.destinations as destination}
					<label class="radio">
						<input
							type="radio"
							name="destination"
							value={`legacy_existing:${destination.allocation_id}`}
							disabled={destination.eligibility !== 'eligible'}
							required
						/>
						<span
							>{destination.display_family_id} · {destination.parent_name_raw ?? '—'} ·
							{destination.maskedEmails.join(', ')} · {translateAdminCode(
								'de',
								destination.eligibility
							)}</span
						>
					</label>
				{/each}
			</fieldset>
			<p>{translate('de', 'admin.family.selectionHint')}</p>
			<button type="submit">{translate('de', 'admin.family.preview')}</button>
		</form>
	</section>

	{#if form && 'preview' in form && form.preview}
		<section class="admin-card preview-card">
			<h3>{translate('de', 'admin.family.preview')}</h3>
			<p>
				<strong>{form.preview.fromFamilyDisplayId}</strong> →
				<strong>{form.preview.toFamilyDisplayId}</strong>
			</p>
			<h4>{translate('de', 'admin.family.affectedChildren')}</h4>
			<ul>
				{#each form.preview.children as child}<li>
						{child.fullName} · {child.birthDate} · {translateAdminCode(
							'de',
							child.effectKind
						)}
					</li>{/each}
			</ul>
			<p>
				{translate('de', 'admin.family.nonterminalOffers')}: {form.preview.consequences
					.nonterminalOfferCount}
			</p>
			<p>
				{translate('de', 'admin.family.immutableContracts')}: {form.preview.consequences
					.immutableContractCount}
			</p>
			{#if form.preview.consequences.safeDetails.contractTablesAvailable === false}<p>
					{translate('de', 'admin.family.contractExtensionNotice')}
				</p>{/if}
			<form method="POST" action="?/applyFamilyCorrection" class="admin-action-form">
				<input type="hidden" name="_csrf" value={data.csrfToken} />
				<input type="hidden" name="previewId" value={form.preview.id} />
				<input
					type="hidden"
					name="idempotencyKey"
					value={`${data.commandKey}:family-apply`}
				/>
				<label for="family-reason">{translate('de', 'admin.reason')}</label>
				<textarea id="family-reason" name="reason" required maxlength="1000"></textarea>
				<label class="checkbox"
					><input type="checkbox" name="confirmation" value="confirmed" required /><span
						>{translate('de', 'admin.family.explicitConfirmation')}</span
					></label
				>
				<button type="submit">{translate('de', 'admin.family.apply')}</button>
			</form>
		</section>
	{/if}
</section>
