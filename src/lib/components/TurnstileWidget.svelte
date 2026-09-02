<script lang="ts" module>
	type TurnstileWidgetId = string;

	interface TurnstileApi {
		render(
			container: HTMLElement,
			options: {
				sitekey: string;
				action: string;
				callback(token: string): void;
				'error-callback'(): boolean;
				'expired-callback'(): void;
				'timeout-callback'(): void;
			}
		): TurnstileWidgetId;
		remove(widgetId: TurnstileWidgetId): void;
	}

	type TurnstileWindow = Window & {
		turnstile?: TurnstileApi;
		kolibriTurnstileOnload?: () => void;
	};
	const scriptId = 'kolibri-turnstile-api';
	const scriptSource =
		'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=kolibriTurnstileOnload';
	let apiPromise: Promise<TurnstileApi> | undefined;

	function loadTurnstileApi(): Promise<TurnstileApi> {
		const turnstileWindow = window as TurnstileWindow;
		if (apiPromise) return apiPromise;
		if (turnstileWindow.turnstile) return Promise.resolve(turnstileWindow.turnstile);

		apiPromise = new Promise<TurnstileApi>((resolve, reject) => {
			const existing = document.getElementById(scriptId);
			const scriptElement =
				existing instanceof HTMLScriptElement ? existing : document.createElement('script');
			const loaded = () => {
				delete turnstileWindow.kolibriTurnstileOnload;
				if (turnstileWindow.turnstile) resolve(turnstileWindow.turnstile);
				else reject(new Error('Turnstile API unavailable after onload callback.'));
			};
			const failed = () => {
				delete turnstileWindow.kolibriTurnstileOnload;
				reject(new Error('Turnstile API script failed to load.'));
			};

			// Async loading requires the API's onload callback, not turnstile.ready().
			turnstileWindow.kolibriTurnstileOnload = loaded;
			scriptElement.addEventListener('error', failed, { once: true });
			if (!existing) {
				scriptElement.id = scriptId;
				scriptElement.src = scriptSource;
				scriptElement.async = true;
				scriptElement.defer = true;
				document.head.appendChild(scriptElement);
			}
		}).catch((error) => {
			apiPromise = undefined;
			throw error;
		});

		return apiPromise;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	let {
		siteKey,
		action,
		ready = $bindable(false),
		failed = $bindable(false),
	}: {
		siteKey: string;
		action: string;
		ready?: boolean;
		failed?: boolean;
	} = $props();
	let container: HTMLDivElement;

	onMount(() => {
		let disposed = false;
		let api: TurnstileApi | undefined;
		let widgetId: TurnstileWidgetId | undefined;
		ready = false;
		failed = false;

		void loadTurnstileApi()
			.then((loadedApi) => {
				api = loadedApi;
				if (disposed) return;
				widgetId = loadedApi.render(container, {
					sitekey: siteKey,
					action,
					callback: () => {
						ready = true;
						failed = false;
					},
					'error-callback': () => {
						ready = false;
						failed = true;
						return true;
					},
					'expired-callback': () => {
						ready = false;
						failed = true;
					},
					'timeout-callback': () => {
						ready = false;
						failed = true;
					},
				});
			})
			.catch(() => {
				if (!disposed) {
					ready = false;
					failed = true;
				}
			});

		return () => {
			disposed = true;
			ready = false;
			if (api && widgetId) api.remove(widgetId);
		};
	});
</script>

<div
	bind:this={container}
	data-turnstile-state={failed ? 'failed' : ready ? 'ready' : 'pending'}
></div>
