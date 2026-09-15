<script lang="ts">
	import { translate, translateUiFeedback } from '$lib/i18n';
	let {
		locale,
		csrfToken,
		child,
		feedback,
	}: {
		locale: string;
		csrfToken: string;
		child?: {
			id: string;
			fullName: string;
			birthDate: string;
			origin: 'portal' | 'legacy';
			pendingCorrection: boolean;
		};
		feedback?: {
			success: boolean;
			message: string;
			duplicate?: boolean;
			childForm?: { action: string; childId?: string; fullName?: string; birthDate?: string };
		} | null;
	} = $props();
	const action = $derived(
		!child ? 'createChild' : child.origin === 'portal' ? 'updateChild' : 'requestCorrection'
	);
	const error = $derived(
		feedback?.success === false &&
			feedback.childForm?.action === action &&
			feedback.childForm.childId === child?.id
			? feedback
			: null
	);
	const prefix = $derived(child ? `child-${child.id}` : 'new-child');
	let fullName = $derived(error?.childForm?.fullName ?? child?.fullName ?? '');
	let birthDate = $derived(error?.childForm?.birthDate ?? child?.birthDate ?? '');
</script>

<!-- Leave the native open state alone when the user expands before hydration. -->
<details id={child ? undefined : 'add-child'} {...(error ? { open: true } : {})}>
	<summary
		>{translate(
			locale,
			!child
				? 'cabinet.child.create'
				: child.origin === 'portal'
					? 'cabinet.child.edit'
					: 'cabinet.child.correct'
		)}</summary
	>
	<form
		method="POST"
		action={`?/${action}`}
		aria-describedby={error ? `${prefix}-error` : undefined}
	>
		<input type="hidden" name="_csrf" value={csrfToken} />
		{#if child}<input type="hidden" name="childId" value={child.id} />{/if}
		{#if error}<p id={`${prefix}-error`} role="alert">
				{translateUiFeedback(locale, error.message)}
			</p>{/if}
		<label for={`${prefix}-name`}>{translate(locale, 'cabinet.child.fullName')}</label>
		<input
			id={`${prefix}-name`}
			name="fullName"
			bind:value={fullName}
			required
			maxlength="160"
		/>
		<label for={`${prefix}-birth`}>{translate(locale, 'cabinet.child.birthDate')}</label>
		<input
			id={`${prefix}-birth`}
			name="birthDate"
			type="date"
			bind:value={birthDate}
			required
		/>
		{#if error?.duplicate && action !== 'requestCorrection'}
			<label class="checkbox"
				><input
					type="checkbox"
					name="confirmDuplicate"
					value="true"
					aria-describedby={`${prefix}-error`}
				/><span>{translate(locale, 'cabinet.child.confirmDuplicate')}</span></label
			>
		{/if}
		<button type="submit" disabled={child?.pendingCorrection}
			>{translate(
				locale,
				!child
					? 'cabinet.child.create'
					: child.origin === 'portal'
						? 'cabinet.child.update'
						: 'cabinet.child.correct'
			)}</button
		>
	</form>
</details>
