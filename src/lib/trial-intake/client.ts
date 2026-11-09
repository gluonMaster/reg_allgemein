/** A refused intake request: `message` is the safe code, `details` its safe numbers. */
export class IntakeRequestError extends Error {
	constructor(
		code: string,
		readonly details: Record<string, unknown> = {}
	) {
		super(code);
	}
}
export async function requestJson<T>(url: string, body?: unknown): Promise<T> {
	const response = await fetch(url, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			accept: 'application/json',
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const value = await response.json();
	if (!response.ok) {
		const { code, ...details } =
			value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
		throw new IntakeRequestError(
			typeof code === 'string' ? code : 'INTAKE_UNAVAILABLE',
			details
		);
	}
	return value as T;
}
