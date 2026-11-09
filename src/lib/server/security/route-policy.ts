export type RouteAccess = 'public' | 'authenticated' | 'parent' | 'admin';

const PARENT_ROUTE_PREFIXES = [
	'/account/privacy',
	'/cabinet',
	'/contracts',
	'/messages',
	'/price-reviews',
	'/requests',
] as const;

function isParentRoute(routeId: string): boolean {
	return (
		PARENT_ROUTE_PREFIXES.some(
			(prefix) => routeId === prefix || routeId.startsWith(`${prefix}/`)
		) ||
		(routeId.startsWith('/catalog/') && routeId.endsWith('/trial'))
	);
}

export function routeAccessPolicy(routeId: string | null): RouteAccess {
	if (
		routeId === null ||
		routeId === '/' ||
		routeId === '/language' ||
		routeId === '/probestunde' || routeId.startsWith('/probestunde/') ||
		routeId === '/warteliste' || routeId.startsWith('/warteliste/') ||
		routeId === '/catalog' ||
		routeId === '/auth' ||
		routeId.startsWith('/auth/')
	) {
		return 'public';
	}
	if (routeId.startsWith('/admin')) return 'admin';
	if (isParentRoute(routeId)) return 'parent';
	return 'authenticated';
}
