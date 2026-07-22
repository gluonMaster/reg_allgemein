import type { MessageKey } from '$lib/i18n';

export interface AdminNavigationItem {
	id: string;
	href: string;
	labelKey: MessageKey;
	order: number;
}

/**
 * Feature stages extend this array instead of introducing another admin
 * layout or authorization boundary.
 */
export const coreAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'dashboard', href: '/admin', labelKey: 'admin.nav.dashboard', order: 10 },
	{ id: 'imports', href: '/admin/imports', labelKey: 'admin.nav.imports', order: 20 },
	{ id: 'reviews', href: '/admin/reviews', labelKey: 'admin.nav.reviews', order: 30 },
	{ id: 'legacy', href: '/admin/legacy', labelKey: 'admin.nav.legacy', order: 40 },
	{ id: 'users', href: '/admin/users', labelKey: 'admin.nav.users', order: 50 },
	{ id: 'catalog', href: '/admin/catalog', labelKey: 'admin.nav.catalog', order: 60 },
	{ id: 'pricing', href: '/admin/pricing', labelKey: 'admin.nav.pricing', order: 70 },
];

export const trialAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'trials', href: '/admin/trials', labelKey: 'admin.nav.trials', order: 65 },
];

export const requestAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'requests', href: '/admin/requests', labelKey: 'admin.nav.requests', order: 66 },
];

export const contractAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'contracts', href: '/admin/contracts', labelKey: 'admin.nav.contracts', order: 67 },
];

export const priceReviewAdminNavigation: readonly AdminNavigationItem[] = [
	{
		id: 'price-reviews',
		href: '/admin/price-reviews',
		labelKey: 'admin.nav.priceReviews',
		order: 68,
	},
];

export const messagingAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'messages', href: '/admin/messages', labelKey: 'admin.nav.messages', order: 69 },
	{ id: 'outbox', href: '/admin/outbox', labelKey: 'admin.nav.outbox', order: 69.5 },
];

export const privacyAdminNavigation: readonly AdminNavigationItem[] = [
	{ id: 'privacy', href: '/admin/privacy', labelKey: 'admin.nav.privacy', order: 69.75 },
];

export function buildAdminNavigation(
	extensions: readonly AdminNavigationItem[] = []
): readonly AdminNavigationItem[] {
	const items = new Map(coreAdminNavigation.map((item) => [item.id, item]));
	for (const item of extensions) items.set(item.id, item);
	return [...items.values()].sort((left, right) => left.order - right.order);
}
