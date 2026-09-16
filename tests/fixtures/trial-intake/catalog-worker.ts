import { CatalogReader } from '../../../src/lib/trial-intake/server/catalog.server';

export default {
	async fetch() {
		try {
			const reader = new CatalogReader('https://schedule.example.test/', undefined, () =>
				caches.open('trial-intake-catalog-v1')
			);
			const first = await reader.read();
			const cached = await reader.read();
			return Response.json({ first, cached });
		} catch {
			return Response.json({ code: 'CATALOG_FAILED' }, { status: 503 });
		}
	},
};
