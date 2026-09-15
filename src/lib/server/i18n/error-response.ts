import { translate, type MessageKey } from '$lib/i18n';
import { normalizeUiLocale } from '$lib/i18n/locale';
import { withSecurityHeaders } from '$lib/server/security/response-headers';

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
	);

/** Hook denials happen before SvelteKit can render the root layout/error page. */
export function localizedAccessError(input: {
	locale?: string;
	status: number;
	messageKey: MessageKey;
	requestId: string;
	returnPath: string;
	production: boolean;
	role?: 'parent' | 'admin' | null;
}): Response {
	const locale = normalizeUiLocale(input.locale);
	const t = (key: MessageKey) => escapeHtml(translate(locale, key));
	const nextHref =
		input.status === 401 || !input.role
			? '/auth/login'
			: input.role === 'admin'
				? '/admin'
				: '/cabinet';
	const nextLabel: MessageKey =
		input.status === 401 || !input.role
			? 'auth.link.login'
			: input.role === 'admin'
				? 'ui.nav.admin'
				: 'ui.nav.parent';
	const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('ui.error.title')}</title>
<style>*{box-sizing:border-box}body{font:1rem/1.6 system-ui,sans-serif;background:#f5f8f8;color:#183c37;margin:0}header{background:white;border-bottom:1px solid #d9e3df;padding:1rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem}header>a{font-size:1.5rem;font-weight:750;text-decoration:none}main{width:min(100% - 2rem,34rem);margin:2rem auto;padding:1.5rem;border:1px solid #d9e3df;border-radius:.75rem;background:white}form,.actions{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center}button,.primary{font:inherit;min-height:44px;padding:.5rem 1rem;border:1px solid #718780;border-radius:.5rem;background:white;color:#183c37}button[aria-pressed=true],.primary{background:#176b54;color:white}.primary{text-decoration:none}a{color:#176b54;display:inline-flex;align-items:center;min-height:44px}h1{font-size:1.6rem}p,code{overflow-wrap:anywhere}button:focus-visible,a:focus-visible{outline:3px solid #2563eb;outline-offset:3px}</style></head><body><header><a href="/">Kolibri</a>
<nav aria-label="${t('language.label')}"><form method="POST" action="/language"><input type="hidden" name="returnTo" value="${escapeHtml(input.returnPath)}"><button name="locale" value="de" lang="de" aria-pressed="${locale === 'de'}">Deutsch</button><button name="locale" value="ru" lang="ru" aria-pressed="${locale === 'ru'}">Русский</button></form></nav>
</header><main><h1>${input.status} · ${t('ui.error.title')}</h1><p role="alert">${t(input.messageKey)}</p><p>${t('ui.error.reference')}: <code>${escapeHtml(input.requestId)}</code></p><div class="actions"><a class="primary" href="${nextHref}">${t(nextLabel)}</a><a href="/">${t('ui.error.home')}</a></div></main></body></html>`;
	return withSecurityHeaders(
		new Response(html, {
			status: input.status,
			headers: { 'content-type': 'text/html; charset=utf-8', vary: 'Cookie' },
		}),
		{ requestId: input.requestId, production: input.production, noStore: true }
	);
}
