import type { Page } from '@playwright/test';

export async function installSyntheticTurnstile(
	page: Page,
	outcome: 'success' | 'pending' = 'success'
): Promise<void> {
	await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*', async (route) => {
		await route.fulfill({
			contentType: 'application/javascript',
			body: `(() => {
					const script = document.currentScript;
					const loadedAsync = script.async || script.defer;
					const onloadName = new URL(script.src).searchParams.get('onload');
					let apiReady = false;
					const widgets = new Map();
					let sequence = 0;
					window.turnstile = {
						ready(callback) {
							if (loadedAsync) {
								throw new Error('[Cloudflare Turnstile] Remove async/defer before using turnstile.ready(). (3857)');
							}
							callback();
						},
						render(container, options) {
							if (!apiReady) throw new Error('Turnstile render called before API onload.');
							const widgetId = 'synthetic-widget-' + (++sequence);
							const input = document.createElement('input');
							input.type = 'hidden';
							input.name = 'cf-turnstile-response';
							input.value = ${JSON.stringify(outcome === 'success' ? 'synthetic-turnstile-pass' : '')};
							container.appendChild(input);
							widgets.set(widgetId, container);
							if (${JSON.stringify(outcome)} === 'success') {
								setTimeout(() => options.callback(input.value), 0);
							}
							return widgetId;
						},
						remove(widgetId) {
							const container = widgets.get(widgetId);
							if (container) container.replaceChildren();
							widgets.delete(widgetId);
						}
					};
					setTimeout(() => {
						apiReady = true;
						if (onloadName) window[onloadName]();
					}, 50);
				})();`,
		});
	});
}
