import { canonicalJson, hashCanonical } from '$lib/server/import/canonical';
import {
	CONTRACT_RENDER_SCHEMA_VERSION,
	contractRenderInputSchema,
	type ContractRenderInput,
	type ContractTemplateId,
} from './contracts';

const PRINT_CSS = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: "Noto Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 20pt; margin: 0 0 6mm; }
h2 { font-size: 13pt; margin: 7mm 0 2mm; break-after: avoid; }
p, li { orphans: 3; widows: 3; }
.meta, .parties, .billing { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; }
.box { border: 0.3mm solid #8993a8; padding: 4mm; break-inside: avoid; }
.label { color: #4d5668; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .02em; }
.page-break { break-before: page; }
.signature { margin-top: 12mm; border-top: 0.3mm solid #172033; padding-top: 2mm; }
.notice { border-left: 1.2mm solid #3157a4; padding: 3mm 4mm; background: #f1f5fb; }
`;

const templateCopy: Record<
	ContractTemplateId,
	{ title: string; serviceTitle: string; billingLead: string; termLead: string }
> = {
	group_yearly: {
		title: 'Jahresvertrag für Gruppenunterricht',
		serviceTitle: 'Gruppenunterricht',
		billingLead: 'Monatlicher Grundpreis',
		termLead: 'Jahreslaufzeit und Verlängerung',
	},
	group_monthly: {
		title: 'Monatliche Vereinbarung für Gruppenunterricht',
		serviceTitle: 'Gruppenunterricht',
		billingLead: 'Monatlicher Grundpreis',
		termLead: 'Monatliche Laufzeit',
	},
	individual_hourly: {
		title: 'Vertrag für individuellen Unterricht',
		serviceTitle: 'Individueller Unterricht',
		billingLead: 'Tarif je durchgeführter Unterrichtseinheit',
		termLead: 'Vereinbarte Laufzeit',
	},
	nachhilfe_hourly: {
		title: 'Vertrag für geförderte Nachhilfe',
		serviceTitle: 'Nachhilfe',
		billingLead: 'Dokumentierter Fördersatz je Unterrichtseinheit',
		termLead: 'Bewilligter Förderzeitraum',
	},
};

function escapeHtml(value: unknown): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function money(cents: number): string {
	return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
		cents / 100
	);
}

export interface RenderedContractSource {
	html: string;
	canonicalInputJson: string;
	renderInputHash: string;
	sourceManifest: {
		renderSchemaVersion: typeof CONTRACT_RENDER_SCHEMA_VERSION;
		templateId: ContractTemplateId;
		templateVersion: string;
		htmlSourceHash: string;
		cssSourceHash: string;
		inputHash: string;
	};
	sourceManifestHash: string;
}

export interface ContractTemplateDefinition {
	templateId: ContractTemplateId;
	templateVersion: string;
	renderSchemaVersion: typeof CONTRACT_RENDER_SCHEMA_VERSION;
	css: string;
	render(input: ContractRenderInput): string;
}

function renderBody(input: ContractRenderInput): string {
	const copy = templateCopy[input.templateId];
	const schedule = input.service.scheduleLines.length
		? `<ul>${input.service.scheduleLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
		: '<p>Die konkrete Terminabstimmung erfolgt mit der Verwaltung.</p>';
	const lineItems = input.billing.lineItems
		.map(
			(item) =>
				`<li><strong>${escapeHtml(item.description)}:</strong> ${escapeHtml(money(item.amountCents))} – ${escapeHtml(item.basis)}</li>`
		)
		.join('');
	return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(copy.title)} ${escapeHtml(input.contractNumber)}</title><style>${PRINT_CSS}</style></head>
<body data-render-schema="${CONTRACT_RENDER_SCHEMA_VERSION}" data-template-id="${input.templateId}">
<header><p class="label">Vertragsangebot ${escapeHtml(input.offerNumber)}</p><h1>${escapeHtml(copy.title)}</h1></header>
<section class="meta"><div class="box"><span class="label">Vertragsnummer</span><br>${escapeHtml(input.contractNumber)}</div>
<div class="box"><span class="label">Leistungsbeginn</span><br>${escapeHtml(input.service.effectiveFrom)}${input.service.effectiveTo ? ` bis einschließlich ${escapeHtml(input.service.effectiveTo)}` : ''}</div></section>
<h2>Vertragsparteien</h2><section class="parties"><div class="box"><strong>${escapeHtml(input.provider.fullName)}</strong><br>${input.provider.addressLines.map(escapeHtml).join('<br>')}</div>
<div class="box"><strong>${escapeHtml(input.parent.fullName)}</strong><br>${input.parent.addressLines.map(escapeHtml).join('<br>')}<br><span class="label">Vertragspartner für ${escapeHtml(input.child.fullName)}</span></div></section>
<h2>${escapeHtml(copy.serviceTitle)}</h2><p><strong>${escapeHtml(input.service.subject)}</strong></p>${schedule}
<h2>${escapeHtml(copy.billingLead)}</h2><div class="billing"><div class="box"><strong>${escapeHtml(money(input.billing.finalPriceCents))}</strong>${input.billing.unitMinutes ? ` je ${input.billing.unitMinutes} Minuten` : ' monatlich'}</div>
<div class="box">Zahlungsregel: ${escapeHtml(input.provider.paymentTermsVersion)}<br>${input.billing.paymentDueDay ? `Fälligkeit spätestens am ${input.billing.paymentDueDay}. des Folgemonats.` : ''}</div></div>
<ul>${lineItems}</ul>${input.billing.basePriceDisclaimer ? '<p class="notice">Der ausgewiesene Gruppenpreis ist ein Grundpreis. Ferien, anteilige Zeiträume und weitere externe Anpassungen werden im Portal nicht berechnet; dieses Dokument ist keine Rechnung.</p>' : ''}
<h2>${escapeHtml(copy.termLead)}</h2><p>${escapeHtml(input.term.initialTermText)}</p><p>${escapeHtml(input.term.renewalText)}</p>
<h2>Beendigung</h2><p>${escapeHtml(input.term.ordinaryTerminationText)}</p><p>${escapeHtml(input.term.extraordinaryTerminationText)}</p>
<section class="page-break"><h2>Vorvertragliche und datenschutzrechtliche Hinweise</h2>
<p>Datenschutzhinweis: ${escapeHtml(input.legal.privacyNoticeVersion)}. Die Kenntnisnahme wird unabhängig von der Vertragsannahme nachgewiesen.</p>
<p>Widerrufsinformation: ${escapeHtml(input.legal.withdrawalTextVersion)}. Rechtsprofil: ${escapeHtml(input.legal.distanceLegalProfile)}.</p>
${input.legal.mediaClauseVersion ? `<p>Medienhinweis: ${escapeHtml(input.legal.mediaClauseVersion)}. Eine Entscheidung hierzu ist freiwillig und von der Vertragsannahme getrennt.</p>` : ''}
<h2>Anlagen und Klauselstand</h2><p>Klauselstand ${escapeHtml(input.legal.clauseSetVersion)}</p><ul>${input.legal.attachments.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
<p class="signature">Dieses Angebot wird im Portal durch ein separates, protokolliertes Elternhandeln angenommen. Der Vertrag entsteht erst durch die anschließende administrative Bestätigung des Vereins. Es werden keine Unterschriftsbilder erzeugt.</p></section>
</body></html>`;
}

export const contractTemplateRegistry: Readonly<Record<ContractTemplateId, ContractTemplateDefinition>> =
	Object.freeze(
		Object.fromEntries(
			(Object.keys(templateCopy) as ContractTemplateId[]).map((templateId) => [
				templateId,
				{
					templateId,
					templateVersion: 'synthetic-core-v1',
					renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
					css: PRINT_CSS,
					render: renderBody,
				},
			])
		) as Record<ContractTemplateId, ContractTemplateDefinition>
	);

export async function renderContractSource(value: unknown): Promise<RenderedContractSource> {
	const input = contractRenderInputSchema.parse(value);
	const template = contractTemplateRegistry[input.templateId];
	const canonicalInputJson = canonicalJson(input);
	const [renderInputHash, htmlSourceHash, cssSourceHash] = await Promise.all([
		hashCanonical(input),
		hashCanonical({ templateId: input.templateId, body: template.render.toString() }),
		hashCanonical({ css: template.css }),
	]);
	const sourceManifest = {
		renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
		templateId: input.templateId,
		templateVersion: template.templateVersion,
		htmlSourceHash,
		cssSourceHash,
		inputHash: renderInputHash,
	};
	return {
		html: template.render(input),
		canonicalInputJson,
		renderInputHash,
		sourceManifest,
		sourceManifestHash: await hashCanonical(sourceManifest),
	};
}
