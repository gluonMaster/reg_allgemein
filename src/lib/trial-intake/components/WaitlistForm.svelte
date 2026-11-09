<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount, tick, untrack } from 'svelte';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import LessonCard from './LessonCard.svelte';
	import ParentFields from './ParentFields.svelte';
	import ChildrenFields from './ChildrenFields.svelte';
	import {
		WAITLIST_PRIVACY_VERSION,
		type IntakeInput,
		type IntakeReceipt,
		type WaitlistInput,
		type WaitlistOffer,
		type WaitlistPageData,
		type WaitlistTariff,
	} from '../contracts';
	import { ageFit, lessonAgeRange } from '../age';
	import { berlinDate, nextLessonDate } from '../dates';
	import { euroAmount } from '../prices';
	import { ORGANIZATION_PHONE } from '../organization';
	import {
		ageRangeLabel,
		errorKey,
		fill,
		formatDate,
		t,
		waitlistConsentText,
		type TextKey,
	} from '../i18n';
	import { IntakeRequestError, requestJson } from '../client';
	import { saveParent } from '../parent-storage';
	import '../intake.css';
	// WL-04: one planned course, its price and an explicit tariff, consent and e-mail confirmation.
	let { data }: { data: WaitlistPageData } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	const lesson = $derived(data.lesson);
	// The form keeps a newer price the server reported until the page loads again.
	let offer = $state<WaitlistOffer | null>(untrack(() => data.offer));
	let ready = $state(false),
		captchaFailed = $state(false),
		captchaVersion = $state(0);
	let now = $state(untrack(() => data.now));
	let pending = $state(false),
		enhanced = $state(false);
	let parentFirstName = $state(''),
		parentLastName = $state(''),
		email = $state(''),
		phone = $state('');
	let children = $state<IntakeInput['children']>([
		{ key: 'child-1', firstName: '', lastName: '', birthDate: '' },
	]);
	let childSequence = 1;
	let tariff = $state<WaitlistTariff | null>(null);
	/** The consent text that was ticked; another tariff, sum or number of children needs a new tick. */
	let consented = $state<string | null>(null);
	/** The older children the parent acknowledged; another set needs a new tick. */
	let ageAcknowledged = $state<string | null>(null);
	let receipt = $state<IntakeReceipt | null>(null),
		resent = $state(false);
	let feedback = $state<TextKey | null>(null);
	let errorElement = $state<HTMLDivElement>();
	let lastAttempt: { fingerprint: string; payload: WaitlistInput } | undefined;
	const amount = $derived(
		offer && tariff ? (tariff === 'monthly' ? offer.monthlyCents : offer.yearlyCents) : null
	);
	const consentText = $derived(
		tariff && amount !== null
			? waitlistConsentText(locale, tariff, amount, children.length)
			: ''
	);
	const consentSignature = $derived(`${tariff}:${amount}:${children.length > 1}`);
	// TIN: the age on the next allowed date of the weekday from tomorrow, holidays skipped.
	const ageDate = $derived(lesson ? nextLessonDate(lesson.weekday, now) : '');
	const ages = $derived.by(() => {
		const range = lesson ? lessonAgeRange(lesson) : null;
		const fit = (c: (typeof children)[number]) => ageFit(range, c.birthDate, ageDate);
		const old = children.filter((c) => fit(c) === 'old');
		return {
			range: range ? ageRangeLabel(range, locale) : '',
			young: children.filter((c) => fit(c) === 'young'),
			old,
			signature: old.map((c) => c.key).join(),
		};
	});
	const remaining = $derived(
		receipt
			? Math.max(0, Math.ceil((Date.parse(receipt.resendAfter) - Date.parse(now)) / 1000))
			: 0
	);
	onMount(() => {
		enhanced = true;
		now = new Date().toISOString();
		const timer = setInterval(() => {
			now = new Date().toISOString();
		}, 1000);
		return () => clearInterval(timer);
	});
	function childName(key: string): string {
		const index = children.findIndex((c) => c.key === key);
		const child = children[index];
		return `${child.firstName || `${t(locale, 'child')} ${index + 1}`} ${child.lastName}`;
	}
	async function showError(key: TextKey) {
		feedback = key;
		await tick();
		errorElement?.focus();
	}
	/** These refusals mean the page state changed; the loader shows the right screen. */
	const RELOAD = new Set([
		'INTAKE_LESSON_UNAVAILABLE',
		'WAITLIST_LESSON_NOT_PLANNED',
		'WAITLIST_COURSE_UNAVAILABLE',
		'WAITLIST_COURSE_STARTED',
		'WAITLIST_PRICE_MISSING',
	]);
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending || !lesson || !offer || !(event.currentTarget instanceof HTMLFormElement))
			return;
		feedback = null;
		if (children.some((c) => c.birthDate > berlinDate(now))) return showError('birthError');
		if (ages.young.length) return showError('ageError');
		if (ages.old.length && ageAcknowledged !== ages.signature)
			return showError('ageConfirmError');
		if (!tariff || amount === null) return showError('waitlistTariffRequired');
		if (consented !== consentSignature) return showError('waitlistConsentRequired');
		const token = new FormData(event.currentTarget).get('cf-turnstile-response');
		if (!ready || typeof token !== 'string') return showError('captcha');
		const content: Omit<WaitlistInput, 'locale' | 'idempotencyKey'> = {
			parentFirstName,
			parentLastName,
			email,
			phone,
			children: $state.snapshot(children),
			lessonId: lesson.id,
			tariff,
			expectedPriceCents: amount,
			consent: true,
			...(ages.old.length ? { ageConfirmed: true as const } : {}),
			privacyVersion: WAITLIST_PRIVACY_VERSION,
		};
		// The same content keeps its key, so a lost response cannot create a second signup.
		const fingerprint = JSON.stringify(content);
		if (!lastAttempt || lastAttempt.fingerprint !== fingerprint)
			lastAttempt = {
				fingerprint,
				payload: { ...content, locale, idempotencyKey: crypto.randomUUID() },
			};
		pending = true;
		try {
			receipt = await requestJson<IntakeReceipt>('/warteliste/submit', {
				...lastAttempt.payload,
				turnstileToken: token,
			});
			saveParent({ parentFirstName, parentLastName, email, phone });
		} catch (e) {
			const code = e instanceof Error ? e.message : '';
			if (code === 'WAITLIST_PRICE_CHANGED' && e instanceof IntakeRequestError) {
				// Show the new sum and ask for the consent again (WL-04).
				offer = {
					monthlyCents: Number(e.details.monthlyCents),
					yearlyCents: Number(e.details.yearlyCents),
					minParticipants: Number(e.details.minParticipants),
				};
				consented = null;
			}
			if (RELOAD.has(code)) {
				await invalidateAll();
				offer = data.offer;
				return;
			}
			await showError(errorKey(code));
		} finally {
			pending = false;
			captchaVersion++;
		}
	}
	async function resend() {
		if (!receipt || pending || remaining) return;
		pending = true;
		feedback = null;
		try {
			const result = await requestJson<
				Pick<IntakeReceipt, 'state'> & { resendAfter?: string }
			>('/probestunde/resend', { id: receipt.id, receipt: receipt.receipt });
			receipt = { ...receipt, ...result };
			resent = true;
		} catch (e) {
			await showError(errorKey(e instanceof Error ? e.message : ''));
		} finally {
			pending = false;
		}
	}
	async function retry() {
		pending = true;
		try {
			await invalidateAll();
			offer = data.offer;
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head
	><title
		>{lesson
			? fill(t(locale, 'waitlistTitle'), { subject: lesson.subject })
			: t(locale, 'waitlistHeading')}
		· {ORGANIZATION_NAME}</title
	></svelte:head
>
<main class="intake intake-shell">
	<h1>
		{receipt
			? t(locale, 'checkMail')
			: lesson
				? fill(t(locale, 'waitlistTitle'), { subject: lesson.subject })
				: t(locale, 'waitlistHeading')}
	</h1>
	{#if feedback}<div bind:this={errorElement} class="error" role="alert" tabindex="-1">
			{t(locale, feedback)}
		</div>{/if}
	{#if receipt}
		<section class="card highlight" aria-live="polite">
			<p>{t(locale, 'mailHint')}</p>
			<p><strong>{email}</strong></p>
			{#if resent}<p role="status">{t(locale, 'resent')}</p>{/if}
			<div class="actions">
				<button type="button" onclick={resend} disabled={pending || remaining > 0}
					>{t(locale, 'resend')}</button
				>
				<button
					type="button"
					disabled={pending}
					onclick={() => {
						receipt = null;
						lastAttempt = undefined;
						resent = false;
					}}>{t(locale, 'correctEmail')}</button
				>
			</div>
			{#if remaining > 0}<p class="muted">
					{t(locale, 'wait')}
					{remaining}
					{t(locale, 'seconds')}
				</p>{/if}
		</section>
	{:else if data.state === 'maintenance'}
		<p class="card" role="status">{t(locale, 'maintenance')}</p>
	{:else if data.state === 'catalog_error'}
		<p class="error">{t(locale, 'unavailable')}</p>
		<button type="button" disabled={pending} onclick={retry}>{t(locale, 'retry')}</button>
	{:else if data.state === 'not_found' || !lesson}
		<p class="error">{t(locale, 'stale')}</p>
	{:else if data.state !== 'form' || !offer}
		<section class="card highlight" role="status">
			<LessonCard {lesson} {locale} duration />
			<p>
				{data.state === 'started'
					? fill(t(locale, 'waitlistStarted'), {
							date: data.firstDate ? formatDate(data.firstDate, locale) : '',
							phone: ORGANIZATION_PHONE,
						})
					: fill(
							t(
								locale,
								data.state === 'price_missing'
									? 'waitlistPriceMissing'
									: 'waitlistUnavailable'
							),
							{ phone: ORGANIZATION_PHONE }
						)}
			</p>
		</section>
	{:else}
		<section class="card highlight">
			<LessonCard {lesson} {locale} duration />
			<p>{fill(t(locale, 'waitlistIntro'), { n: offer.minParticipants })}</p>
		</section>
		<noscript><p class="error">{t(locale, 'noScript')}</p></noscript>
		<form onsubmit={submit}>
			<fieldset disabled={pending || !enhanced} class="form-controls">
				<section class="card">
					<h2>1. {t(locale, 'waitlistPrice')}</h2>
					<fieldset>
						<legend class="visually-hidden">{t(locale, 'waitlistPrice')}</legend>
						<div class="checks">
							<label class="check"
								><input
									type="radio"
									name="tariff"
									value="monthly"
									bind:group={tariff}
									required
								/>{fill(t(locale, 'waitlistTariffMonthly'), {
									amount: euroAmount(offer.monthlyCents),
								})}</label
							>
							<label class="check"
								><input
									type="radio"
									name="tariff"
									value="yearly"
									bind:group={tariff}
									required
								/>{fill(t(locale, 'waitlistTariffYearly'), {
									amount: euroAmount(offer.yearlyCents),
								})}</label
							>
						</div>
					</fieldset>
					<p class="muted">{t(locale, 'waitlistContractNote')}</p>
				</section>
				<ParentFields
					bind:firstName={parentFirstName}
					bind:lastName={parentLastName}
					bind:email
					bind:phone
					{locale}
					number={2}
				/>
				<ChildrenFields
					bind:children
					{locale}
					number={3}
					maxDate={berlinDate(now)}
					{pending}
					onadd={() =>
						children.push({
							key: `child-${++childSequence}`,
							firstName: '',
							lastName: '',
							birthDate: '',
						})}
					onremove={(key) => (children = children.filter((c) => c.key !== key))}
				/>
				{#if ages.young.length || ages.old.length}
					<section class="card">
						{#each ages.young as child (child.key)}<p class="error" role="alert">
								<strong>{childName(child.key)}</strong>
								{t(locale, 'ageYoung')} ({t(locale, 'age')}: {ages.range})
							</p>{/each}
						{#if ages.old.length}<div class="age-warning" role="alert">
								<p class="age-warning-title">⚠ {t(locale, 'ageOldTitle')}</p>
								{#each ages.old as child (child.key)}<p>
										<strong>{childName(child.key)}</strong>
										{t(locale, 'ageOld')} ({t(locale, 'age')}: {ages.range})
									</p>{/each}
								<p>{t(locale, 'ageOldHint')}</p>
								<label class="check"
									><input
										type="checkbox"
										required
										checked={ageAcknowledged === ages.signature}
										onchange={(e) =>
											(ageAcknowledged = e.currentTarget.checked
												? ages.signature
												: null)}
									/>{t(locale, 'ageConfirm')}</label
								>
							</div>{/if}
					</section>
				{/if}
				<div class="card">
					{#if consentText}<label class="check consent"
							><input
								type="checkbox"
								name="consent"
								required
								checked={consented === consentSignature}
								onchange={(e) =>
									(consented = e.currentTarget.checked ? consentSignature : null)}
							/>{consentText}</label
						>{/if}
					{#key captchaVersion}{#if data.turnstileSiteKey}<TurnstileWidget
								siteKey={data.turnstileSiteKey}
								action="trial_intake"
								language={locale}
								bind:ready
								bind:failed={captchaFailed}
							/>{/if}{/key}
					{#if captchaFailed}<p class="error">{t(locale, 'captcha')}</p>
						<button type="button" onclick={() => captchaVersion++}
							>{t(locale, 'captchaRetry')}</button
						>{/if}
					<p class="muted">{t(locale, 'waitlistPrivacy')}</p>
					<button class="primary submit" type="submit" disabled={pending || !ready}
						>{t(locale, pending ? 'busy' : 'waitlistSubmit')}</button
					>
				</div>
			</fieldset>
		</form>
	{/if}
	<p><a href={data.scheduleUrl}>{t(locale, 'back')}</a></p>
</main>
