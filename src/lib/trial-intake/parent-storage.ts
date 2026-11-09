/**
 * TIN "Повторная заявка": after a successful submit only the parent contacts stay on the device,
 * until the user or the browser clears them. Children, lessons and receipts are never stored.
 * Blocked or corrupt storage must never break a form, so every access is guarded.
 */
const KEY = 'trial-intake:parent:v1';
export interface ParentContacts {
	parentFirstName: string;
	parentLastName: string;
	email: string;
	phone: string;
}
export function savedParent(): Partial<ParentContacts> {
	try {
		const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
		return Object.fromEntries(
			(['parentFirstName', 'parentLastName', 'email', 'phone'] as const).flatMap((field) => {
				const value = Reflect.get(saved, field);
				return typeof value === 'string' ? [[field, value]] : [];
			})
		);
	} catch {
		return {};
	}
}
export function saveParent(contacts: ParentContacts): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(contacts));
	} catch {
		// A successful request stays successful when browser storage is blocked.
	}
}
export function forgetParent(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Storage can be unavailable in private or restricted browsers.
	}
}
