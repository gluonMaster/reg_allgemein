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
	if (!response.ok)
		throw new Error(
			value && typeof value === 'object' && 'code' in value && typeof value.code === 'string'
				? value.code
				: 'INTAKE_UNAVAILABLE'
		);
	return value as T;
}
