const EXACT = new Set([
	'/',
	'/language',
	'/probestunde',
	'/probestunde/catalog',
	'/probestunde/submit',
	'/probestunde/verify',
	'/probestunde/resend',
	'/probestunde/privacy',
	'/auth/login',
	'/auth/logout',
	'/auth/forgot',
	'/auth/reset',
	'/admin',
	'/admin/trial-intake',
	'/admin/trial-intake/email',
	'/admin/trial-intake/groups',
	'/admin/trial-intake/warteliste',
	'/admin/trial-intake/warteliste/preise.csv',
	'/admin/trial-intake/warteliste/preise.xlsx',
	'/admin/trial-intake/warteliste/import',
	'/admin/trial-intake/[id]',
	'/admin/outbox',
	'/admin/operations',
]);
export function intakeRouteAllowed(routeId: string | null): boolean {
	return routeId !== null && EXACT.has(routeId);
}
