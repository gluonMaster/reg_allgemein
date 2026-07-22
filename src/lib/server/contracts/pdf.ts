import type { ContractRuntimeConfig } from '$lib/server/config/runtime';
import { sha256Bytes, sha256Hex } from '$lib/server/security/digest';

export interface ContractPdfResult {
	bytes: Uint8Array;
	sha256: string;
	browserMsUsed: number | null;
}

export class ContractPdfError extends Error {
	constructor(
		readonly code: string,
		readonly retryable = false,
		readonly retryAfterSeconds: number | null = null
	) {
		super(code);
		this.name = 'ContractPdfError';
	}
}

export interface ContractPdfAdapter {
	readonly rendererId: 'synthetic-test-pdf-v1' | 'cloudflare-browser-run-pdf-v1';
	readonly rendererContractVersion: 'pdf-adapter-v1';
	render(input: {
		html: string;
		sourceManifestHash: string;
		browserBudgetUsedMs: number;
	}): Promise<ContractPdfResult>;
}

function pdfEscape(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function buildMinimalPdf(lines: readonly string[]): Uint8Array {
	const stream = [
		'BT',
		'/F1 11 Tf',
		'48 790 Td',
		...lines.flatMap((line, index) => [
			index === 0 ? '' : '0 -18 Td',
			`(${pdfEscape(line.slice(0, 100))}) Tj`,
		]),
		'ET',
	]
		.filter(Boolean)
		.join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		`<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
	];
	let pdf = '%PDF-1.7\n% synthetic contract adapter\n';
	const offsets = [0];
	for (let index = 0; index < objects.length; index += 1) {
		offsets.push(new TextEncoder().encode(pdf).byteLength);
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefOffset = new TextEncoder().encode(pdf).byteLength;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets
		.slice(1)
		.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
		.join('');
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return new TextEncoder().encode(pdf);
}

export class SyntheticContractPdfAdapter implements ContractPdfAdapter {
	readonly rendererId = 'synthetic-test-pdf-v1' as const;
	readonly rendererContractVersion = 'pdf-adapter-v1' as const;

	constructor(
		private readonly config: Pick<ContractRuntimeConfig, 'maxHtmlBytes' | 'maxPdfBytes'>,
		private readonly appEnvironment: 'test'
	) {}

	async render(input: {
		html: string;
		sourceManifestHash: string;
		browserBudgetUsedMs: number;
	}): Promise<ContractPdfResult> {
		if (this.appEnvironment !== 'test') throw new ContractPdfError('SYNTHETIC_ADAPTER_FORBIDDEN');
		const htmlBytes = new TextEncoder().encode(input.html);
		if (htmlBytes.byteLength > this.config.maxHtmlBytes) {
			throw new ContractPdfError('HTML_SIZE_LIMIT');
		}
		const htmlHash = await sha256Hex(input.html);
		const bytes = buildMinimalPdf([
			'Synthetic contract artifact - not for production',
			`Source manifest: ${input.sourceManifestHash}`,
			`Canonical HTML: ${htmlHash}`,
		]);
		if (bytes.byteLength > this.config.maxPdfBytes) throw new ContractPdfError('PDF_SIZE_LIMIT');
		return {
			bytes,
			sha256: await sha256Bytes(bytes.slice().buffer as ArrayBuffer),
			browserMsUsed: null,
		};
	}
}

export class BrowserRunContractPdfAdapter implements ContractPdfAdapter {
	readonly rendererId = 'cloudflare-browser-run-pdf-v1' as const;
	readonly rendererContractVersion = 'pdf-adapter-v1' as const;

	constructor(
		private readonly browser: BrowserRun,
		private readonly config: Pick<
			ContractRuntimeConfig,
			'maxHtmlBytes' | 'maxPdfBytes' | 'browserDailyBudgetMs'
		>
	) {}

	async render(input: {
		html: string;
		sourceManifestHash: string;
		browserBudgetUsedMs: number;
	}): Promise<ContractPdfResult> {
		const htmlBytes = new TextEncoder().encode(input.html);
		if (htmlBytes.byteLength > this.config.maxHtmlBytes) {
			throw new ContractPdfError('HTML_SIZE_LIMIT');
		}
		if (/<script\b/iu.test(input.html) || /(?:src|href)\s*=\s*["'](?:https?:)?\/\//iu.test(input.html)) {
			throw new ContractPdfError('EXTERNAL_RESOURCE_OR_SCRIPT_FORBIDDEN');
		}
		if (input.browserBudgetUsedMs >= this.config.browserDailyBudgetMs) {
			throw new ContractPdfError('BROWSER_DAILY_BUDGET_EXCEEDED');
		}

		const response = await this.browser.quickAction('pdf', {
			html: input.html,
			setJavaScriptEnabled: false,
			rejectRequestPattern: ['^https?://', '^//'],
			emulateMediaType: 'print',
			gotoOptions: { timeout: 30_000, waitUntil: 'domcontentloaded' },
			actionTimeout: 30_000,
			cacheTTL: 0,
			pdfOptions: {
				format: 'a4',
				preferCSSPageSize: true,
				printBackground: true,
				tagged: true,
				outline: true,
			},
		});
		if (!response.ok) {
			const retryable = response.status === 429 || response.status >= 500;
			const retryAfter = Number(response.headers.get('Retry-After'));
			throw new ContractPdfError(
				`BROWSER_RUN_${response.status}`,
				retryable,
				Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null
			);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength === 0 || bytes.byteLength > this.config.maxPdfBytes) {
			throw new ContractPdfError('PDF_SIZE_LIMIT');
		}
		if (new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
			throw new ContractPdfError('BROWSER_RESPONSE_NOT_PDF');
		}
		const browserMs = Number(response.headers.get('X-Browser-Ms-Used'));
		return {
			bytes,
			sha256: await sha256Bytes(bytes),
			browserMsUsed: Number.isFinite(browserMs) && browserMs >= 0 ? browserMs : null,
		};
	}
}
