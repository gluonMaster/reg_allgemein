<script lang="ts">
	import type { IntakeInput } from '../contracts';
	import { t, type Locale } from '../i18n';
	// 1-10 children of the trial request and the waitlist (TIN-02). Keys are issued by the form:
	// a removed key is never reused, so an acknowledgment cannot pass to another child.
	let {
		children = $bindable(),
		locale,
		number,
		maxDate,
		pending,
		onadd,
		onremove,
	}: {
		children: IntakeInput['children'];
		locale: Locale;
		number: number;
		maxDate: string;
		pending: boolean;
		onadd: () => void;
		onremove: (key: string) => void;
	} = $props();
</script>

<section class="card">
	<h2>{number}. {t(locale, 'children')}</h2>
	{#each children as child, index (child.key)}
		<fieldset>
			<legend>{t(locale, 'child')} {index + 1}</legend>
			<div class="fields">
				<label
					>{t(locale, 'firstName')}<input
						name={`first-${child.key}`}
						autocomplete="off"
						bind:value={child.firstName}
						required
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'lastName')}<input
						name={`last-${child.key}`}
						autocomplete="off"
						bind:value={child.lastName}
						required
						maxlength="160"
					/></label
				>
				<label
					>{t(locale, 'birthDate')}<input
						name={`birth-${child.key}`}
						type="date"
						bind:value={child.birthDate}
						required
						max={maxDate}
					/></label
				>
			</div>
			{#if children.length > 1}<div class="actions">
					<button type="button" onclick={() => onremove(child.key)}
						>{t(locale, 'remove')} · {t(locale, 'child')}
						{index + 1}</button
					>
				</div>{/if}
		</fieldset>
	{/each}
	<button type="button" disabled={children.length >= 10 || pending} onclick={onadd}
		>+ {t(locale, 'addChild')}</button
	>
</section>
