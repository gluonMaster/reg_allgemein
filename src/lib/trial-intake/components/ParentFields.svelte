<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '../i18n';
	import { forgetParent, savedParent } from '../parent-storage';
	// Contacts of the trial request and the waitlist (TIN-02); saved ones fill only empty fields.
	let {
		firstName = $bindable(),
		lastName = $bindable(),
		email = $bindable(),
		phone = $bindable(),
		locale,
		number,
	}: {
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		locale: Locale;
		number: number;
	} = $props();
	onMount(() => {
		const saved = savedParent();
		if (!firstName && saved.parentFirstName) firstName = saved.parentFirstName;
		if (!lastName && saved.parentLastName) lastName = saved.parentLastName;
		if (!email && saved.email) email = saved.email;
		if (!phone && saved.phone) phone = saved.phone;
	});
	function forget() {
		// The device cookie stays: another address still needs its own confirmation.
		forgetParent();
		firstName = lastName = email = phone = '';
	}
</script>

<section class="card">
	<h2>{number}. {t(locale, 'contacts')}</h2>
	<div class="fields">
		<label
			>{t(locale, 'firstName')}<input
				name="parentFirstName"
				autocomplete="given-name"
				bind:value={firstName}
				required
				maxlength="160"
			/></label
		>
		<label
			>{t(locale, 'lastName')}<input
				name="parentLastName"
				autocomplete="family-name"
				bind:value={lastName}
				required
				maxlength="160"
			/></label
		>
		<label
			>{t(locale, 'email')}<input
				name="email"
				type="email"
				autocomplete="email"
				bind:value={email}
				required
				maxlength="160"
			/></label
		>
		<label
			>{t(locale, 'phone')}<input
				name="phone"
				type="tel"
				autocomplete="tel"
				bind:value={phone}
				required
				minlength="5"
				maxlength="160"
			/></label
		>
	</div>
	<button class="text-link" type="button" onclick={forget}>{t(locale, 'notMyDetails')}</button>
</section>
