import type { Page } from '@playwright/test';

export async function installSyntheticTurnstile(
	page: Page,
	outcome: 'success' | 'pending' = 'success'
): Promise<void> {
	await page.route(
		'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
		async (route) => {
			await route.fulfill({
				contentType: 'application/javascript',
				body: `(() => {
					const widgets = new Map();
					let sequence = 0;
					window.turnstile = {
						ready(callback) { callback(); },
						render(container, options) {
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
				})();`,
			});
		}
	);
}
