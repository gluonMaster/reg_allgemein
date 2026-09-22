<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick, untrack } from 'svelte';
	import TurnstileWidget from '$lib/components/TurnstileWidget.svelte';
	import LessonCard from './LessonCard.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import {
		INTAKE_PRIVACY_VERSION,
		type CatalogData,
		type IntakeFormData,
		type IntakeInput,
		type IntakeReceipt,
	} from '../contracts';
	import { berlinDate, lessonDates, nextLessonDate, weekday } from '../dates';
	import { dayLabel, formatDate, t, errorKey, type TextKey } from '../i18n';
	import { requestJson } from '../client';
	import '../intake.css';
	let { data }: { data: IntakeFormData } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	let lessons = $state(untrack(() => data.lessons));
	let closedIds = $state(untrack(() => data.closedLessonIds));
	let showPicker = $state(false);
	let catalogFailed = $state(untrack(() => data.catalogError));
	let accepting = $state(untrack(() => data.accepting));
	let ready = $state(false),
		captchaFailed = $state(false),
		captchaVersion = $state(0);
	let now = $state(untrack(() => data.now));
	let pending = $state(false),
		picker = $state(false),
		search = $state(''),
		enhanced = $state(false);
	let parentFirstName = $state(''),
		parentLastName = $state(''),
		email = $state(''),
		phone = $state('');
	let children = $state<IntakeInput['children']>([
		{ key: 'child-1', firstName: '', lastName: '', birthDate: '' },
	]);
	let childSequence = 1;
	let items = $state<IntakeInput['items']>(
		untrack(() => {
			const selected = data.lessons.find(
				(l) => l.id === data.selectedId && !data.closedLessonIds.includes(l.id)
			);
			return selected
				? [
						{
							lessonId: selected.id,
							desiredDate: nextLessonDate(selected.weekday, data.now),
							childKeys: ['child-1'],
						},
					]
				: [];
		})
	);
	let receipt = $state<IntakeReceipt | null>(null),
		resent = $state(false);
	let feedback = $state<TextKey | null>(null);
	let errorElement = $state<HTMLDivElement>();
	let lastAttempt: { fingerprint: string; payload: IntakeInput } | undefined;
	const initialLesson = $derived(lessons.find((l) => l.id === data.selectedId));
	const initialClosed = $derived(!!initialLesson && closedIds.includes(initialLesson.id));
	const closedSelection = $derived(!showPicker && initialClosed);
	const available = $derived(
		lessons.filter(
			(l) =>
				!items.some((i) => i.lessonId === l.id) &&
				!closedIds.includes(l.id) &&
				[l.subject, l.group, l.teacher, l.room, l.building]
					.join(' ')
					.toLocaleLowerCase()
					.includes(search.toLocaleLowerCase().trim())
		)
	);
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
	async function showError(key: TextKey) {
		feedback = key;
		await tick();
		errorElement?.focus();
	}
	function addLesson(id: string) {
		const lesson = lessons.find((l) => l.id === id);
		if (
			!lesson ||
			closedIds.includes(id) ||
			items.length >= 10 ||
			items.some((i) => i.lessonId === id)
		)
			return;
		items.push({
			lessonId: id,
			desiredDate: nextLessonDate(lesson.weekday, now),
			childKeys: [children[0].key],
		});
		picker = false;
		search = '';
		feedback = null;
	}
	/** Six upcoming dates keep the choice short while staying on the lesson's own weekday. */
	const LESSON_DATE_CHOICES = 6;
	const today = $derived(berlinDate(now));
	function dateChoices(day: number | undefined, chosen: string): string[] {
		if (!day) return chosen ? [chosen] : [];
		const dates = lessonDates(day, today, LESSON_DATE_CHOICES);
		return chosen && !dates.includes(chosen) ? [...dates, chosen].sort() : dates;
	}
	$effect(() => {
		// A new Berlin day retires the earliest choice, so move any stale date forward.
		const day = today;
		untrack(() => {
			for (const item of items) {
				const lesson = lessons.find((l) => l.id === item.lessonId);
				if (lesson && item.desiredDate <= day)
					item.desiredDate = nextLessonDate(lesson.weekday, day);
			}
		});
	});
	function removeChild(key: string) {
		children = children.filter((c) => c.key !== key);
		items = items.map((i) => ({ ...i, childKeys: i.childKeys.filter((k) => k !== key) }));
	}
	async function reloadCatalog() {
		pending = true;
		try {
			const result = await requestJson<CatalogData>('/probestunde/catalog');
			lessons = result.lessons;
			closedIds = result.closedLessonIds;
			accepting = result.accepting;
			catalogFailed = false;
			if (!items.length && !lastAttempt && initialLesson) addLesson(initialLesson.id);
			feedback = null;
		} catch {
			await showError('unavailable');
		} finally {
			pending = false;
		}
	}
	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending || !(event.currentTarget instanceof HTMLFormElement)) return;
		feedback = null;
		if (!items.length) return showError('chooseFirst');
		if (items.some((i) => !i.childKeys.length)) return showError('assignmentError');
		if (children.some((c) => c.birthDate > berlinDate(now))) return showError('birthError');
		if (
			items.some((i) => {
				const l = lessons.find((l) => l.id === i.lessonId);
				return !l;
			})
		)
			return showError('stale');
		if (
			items.some(
				(i) =>
					i.desiredDate <= berlinDate(now) ||
					weekday(i.desiredDate) !== lessons.find((l) => l.id === i.lessonId)!.weekday
			)
		)
			return showError('dateError');
		const token = new FormData(event.currentTarget).get('cf-turnstile-response');
		if (!ready || typeof token !== 'string') return showError('captcha');
		const content: Omit<IntakeInput, 'locale' | 'idempotencyKey'> = {
			parentFirstName,
			parentLastName,
			email,
			phone,
			children: $state.snapshot(children),
			items: $state.snapshot(items),
			privacyVersion: INTAKE_PRIVACY_VERSION,
		};
		const fingerprint = JSON.stringify(content);
		if (!lastAttempt || lastAttempt.fingerprint !== fingerprint)
			lastAttempt = {
				fingerprint,
				payload: { ...content, locale, idempotencyKey: crypto.randomUUID() },
			};
		pending = true;
		try {
			receipt = await requestJson<IntakeReceipt>('/probestunde/submit', {
				...lastAttempt.payload,
				turnstileToken: token,
			});
		} catch (e) {
			await showError(errorKey(e instanceof Error ? e.message : ''));
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
</script>

<svelte:head><title>{t(locale, 'title')} · {ORGANIZATION_NAME}</title></svelte:head>
<main class="intake intake-shell">
	<h1>
		{receipt
			? t(locale, receipt.state === 'pending_email' ? 'checkMail' : 'successTitle')
			: t(locale, 'title')}
	</h1>
	{#if feedback}<div bind:this={errorElement} class="error" role="alert" tabindex="-1">
			{t(locale, feedback)}
		</div>{/if}
	{#if receipt}
		<section class="card highlight" aria-live="polite">
			{#if receipt.state !== 'pending_email'}<p>{t(locale, 'success')}</p>
			{:else}
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
			{/if}
		</section>
	{:else if !accepting}
		<p class="card" role="status">{t(locale, 'maintenance')}</p>
	{:else if closedSelection}
		<section class="card highlight" role="status">
			<h2>{t(locale, 'closedTitle')}</h2>
			{#if initialLesson}<LessonCard lesson={initialLesson} {locale} />{/if}
			<p>{t(locale, 'closedText')}</p>
			<div class="actions">
				<a class="button primary" href={data.scheduleUrl}>{t(locale, 'closedBack')}</a>
				<button type="button" onclick={() => (showPicker = true)}
					>{t(locale, 'closedChoose')}</button
				>
			</div>
		</section>
	{:else}
		<p>{t(locale, 'intro')}</p>
		<noscript><p class="error">{t(locale, 'noScript')}</p></noscript>
		{#if initialLesson && !initialClosed}<section class="card highlight">
				<p class="kicker">{t(locale, 'selected')}</p>
				<LessonCard lesson={initialLesson} {locale} />
			</section>
		{:else if data.selectedId && !catalogFailed}<p class="error">{t(locale, 'stale')}</p>{/if}
		{#if catalogFailed}<p class="error">{t(locale, 'unavailable')}</p>{/if}
		{#if catalogFailed || feedback === 'stale' || feedback === 'unavailable'}<button
				type="button"
				disabled={pending}
				onclick={reloadCatalog}>{t(locale, 'retry')}</button
			>{/if}
		<form onsubmit={submit}>
			<fieldset disabled={pending || !enhanced} class="form-controls">
				<section class="card">
					<h2>1. {t(locale, 'contacts')}</h2>
					<div class="fields">
						<label
							>{t(locale, 'firstName')}<input
								name="parentFirstName"
								autocomplete="given-name"
								bind:value={parentFirstName}
								required
								maxlength="160"
							/></label
						>
						<label
							>{t(locale, 'lastName')}<input
								name="parentLastName"
								autocomplete="family-name"
								bind:value={parentLastName}
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
				</section>
				<section class="card">
					<h2>2. {t(locale, 'children')}</h2>
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
										max={berlinDate(now)}
									/></label
								>
							</div>
							{#if children.length > 1}<div class="actions">
									<button type="button" onclick={() => removeChild(child.key)}
										>{t(locale, 'remove')} · {t(locale, 'child')}
										{index + 1}</button
									>
								</div>{/if}
						</fieldset>
					{/each}
					<button
						type="button"
						disabled={children.length >= 10 || pending}
						onclick={() =>
							children.push({
								key: `child-${++childSequence}`,
								firstName: '',
								lastName: '',
								birthDate: '',
							})}>+ {t(locale, 'addChild')}</button
					>
				</section>
				<section class="card">
					<h2>3. {t(locale, 'lessons')}</h2>
					<p class="muted">{t(locale, 'dateNotice')}</p>
					{#each items as item, index (item.lessonId)}
						{@const lesson = lessons.find((l) => l.id === item.lessonId)}
						<fieldset class="chosen-lesson">
							<legend>{index + 1}. {lesson?.subject ?? t(locale, 'stale')}</legend>
							{#if lesson}<LessonCard {lesson} {locale} />{/if}
							<div class="actions">
								<label
									>{t(locale, 'date')}<select
										bind:value={item.desiredDate}
										required
										aria-invalid={feedback === 'dateError' ? true : undefined}
									>
										{#each dateChoices(lesson?.weekday, item.desiredDate) as choice (choice)}
											<option value={choice}
												>{dayLabel(weekday(choice), locale)},
												{formatDate(choice, locale)}</option
											>
										{/each}
									</select></label
								>
							</div>
							<fieldset>
								<legend>{t(locale, 'assignments')}</legend>
								<div class="checks">
									{#each children as child, childIndex (child.key)}<label
											class="check"
											><input
												type="checkbox"
												value={child.key}
												bind:group={item.childKeys}
											/>{child.firstName ||
												`${t(locale, 'child')} ${childIndex + 1}`}
											{child.lastName}</label
										>{/each}
								</div>
								{#if !item.childKeys.length}<p class="error">
										{t(locale, 'assignmentError')}
									</p>{/if}
							</fieldset>
							<button
								type="button"
								onclick={() =>
									(items = items.filter((i) => i.lessonId !== item.lessonId))}
								>{t(locale, 'remove')} · {lesson?.subject ?? index + 1}</button
							>
						</fieldset>
					{/each}
					{#if !items.length}<p>{t(locale, 'chooseFirst')}</p>{/if}
					<button
						type="button"
						disabled={items.length >= 10 || pending || catalogFailed}
						onclick={() => (picker = !picker)}
						aria-expanded={picker}
						>+ {t(locale, items.length ? 'addAnotherLesson' : 'addLesson')}</button
					>
					{#if picker}<div class="picker">
							<label
								>{t(locale, 'search')}<input
									type="search"
									bind:value={search}
								/></label
							>
							{#each available as lesson (lesson.id)}<div class="result">
									<LessonCard {lesson} {locale} /><button
										type="button"
										onclick={() => addLesson(lesson.id)}
										>{t(locale, 'choose')} · {lesson.subject}</button
									>
								</div>{/each}
							{#if !available.length}<p>{t(locale, 'noResults')}</p>{/if}
						</div>{/if}
				</section>
				<div class="card">
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
					<p class="muted">{t(locale, 'privacy')}</p>
					<button
						class="primary submit"
						type="submit"
						disabled={pending || !ready || catalogFailed}
						>{t(locale, pending ? 'busy' : 'submit')}</button
					>
				</div>
			</fieldset>
		</form>
	{/if}
	<p><a href={data.scheduleUrl}>{t(locale, 'back')}</a></p>
</main>
