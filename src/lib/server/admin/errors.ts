export class AdminConsoleError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'AdminConsoleError';
	}
}
