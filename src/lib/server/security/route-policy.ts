export type RouteAccess = 'public' | 'authenticated' | 'admin';

export function routeAccessPolicy(routeId: string | null): RouteAccess {
	if (
		routeId === null ||
		routeId === '/' ||
		routeId === '/catalog' ||
		routeId === '/auth' ||
		routeId.startsWith('/auth/')
	) {
		return 'public';
	}
	if (routeId.startsWith('/admin')) return 'admin';
	return 'authenticated';
}
