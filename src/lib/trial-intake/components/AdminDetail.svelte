<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t, formatDate, formatTimestamp, errorKey, type TextKey } from '../i18n';
	import { itemLesson, type AdminDetailData } from '../contracts';
	import { requestJson } from '../client';
	import LessonCard from './LessonCard.svelte';
	import { ORGANIZATION_NAME } from '$lib/organization';
	import { translateAdminCode } from '$lib/i18n';
	import '../intake.css';
	let { data }: { data: { intakeDetail: AdminDetailData; csrfToken: string } } = $props();
	const locale = $derived(page.data.locale ?? 'de');
	const detail = $derived(data.intakeDetail);
	const request = $derived(detail.request);
	let busy = $state(false),
		feedback = $state<TextKey | null>(null);
	let enhanced = $state(false);
	onMount(() => {
		enhanced = true;
	});
	async function setProcessed() {
		if (busy) return;
		busy = true;
		feedback = null;
		try {
			await requestJson(`/admin/trial-intake/${request.id}`, {
				processed: request.state !== 'processed',
				_csrf: data.csrfToken,
			});
			await invalidateAll();
		} catch (e) {
			feedback = errorKey(e instanceof Error ? e.message : '');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t(locale, 'request')} · {ORGANIZATION_NAME}</title></svelte:head>
<section class="intake">
	<a href="/admin/trial-intake">← {t(locale, 'backList')}</a>
	<h2>{t(locale, 'request')} {request.id.slice(0, 8)}</h2>
	<section class="card">
		<span class="badge"
			>{t(locale, request.state === 'processed' ? 'processed' : 'verified')}</span
		>
		<h3>{request.parentFirstName} {request.parentLastName}</h3>
		<dl>
			<dt>{t(locale, 'phone')}</dt>
			<dd><a href={`tel:${request.phone.replace(/[^+\d]/g, '')}`}>{request.phone}</a></dd>
			<dt>{t(locale, 'email')}</dt>
			<dd><a href={`mailto:${request.email}`}>{request.email}</a></dd>
			<dt>{t(locale, 'created')}</dt>
			<dd>{formatTimestamp(request.createdAt, locale)}</dd>
			<dt>{t(locale, 'confirmed')}</dt>
			<dd>{request.verifiedAt ? formatTimestamp(request.verifiedAt, locale) : '—'}</dd>
			{#if request.processedAt}<dt>{t(locale, 'processed')}</dt>
				<dd>{formatTimestamp(request.processedAt, locale)}</dd>{/if}
		</dl>
	</section>
	<section class="card">
		<h3>{t(locale, 'children')}</h3>
		<ul>
			{#each detail.children as child}<li>
					{child.first_name}
					{child.last_name} · {formatDate(child.birth_date, locale)}
				</li>{/each}
		</ul>
	</section>
	{#each detail.items as item (item.id)}<article class="card">
			<LessonCard lesson={itemLesson(item)} {locale} />
			<p><strong>{t(locale, 'date')}: {formatDate(item.desired_date, locale)}</strong></p>
			<ul>
				{#each item.children as child}<li>
						{child.first_name}
						{child.last_name} · {formatDate(child.birth_date, locale)}
					</li>{/each}
			</ul>
		</article>{/each}
	<section class="card">
		<p>{t(locale, 'processedHint')}</p>
		<button class="primary" type="button" disabled={busy || !enhanced} onclick={setProcessed}
			>{t(
				locale,
				busy ? 'busy' : request.state === 'processed' ? 'reopen' : 'markProcessed'
			)}</button
		>
		{#if feedback}<p role="alert" class="error">{t(locale, feedback)}</p>{/if}
	</section>
	<section class="card">
		<h3>{t(locale, 'delivery')}</h3>
		{#each detail.delivery as job}<p>
				<code>{job.id}</code> · <strong>{translateAdminCode(locale, job.status)}</strong> · {job.attempts}{#if job.last_error_code}
					· {job.last_error_code}{/if}
			</p>{/each}
		<a
			class="button"
			href={`/admin/outbox?channel=telegram&q=${encodeURIComponent(`ti:${request.id}`)}`}
			>{t(locale, 'recovery')}</a
		>
	</section>
</section>
