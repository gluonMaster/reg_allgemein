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

export const PREVIEW_REVIEW_TEMPLATE_VERSION = 'preview-review-v1' as const;
export const PREVIEW_REVIEW_CLAUSE_SET_VERSION = 'preview-review-clauses-v1' as const;

const PREVIEW_REVIEW_CSS = `${PRINT_CSS}
.preview-review-watermark { position: fixed; inset: 42% auto auto 4%; width: 92%;
	text-align: center; transform: rotate(-28deg); color: #a10f22; opacity: .13;
	font-size: 34pt; font-weight: 800; letter-spacing: .08em; z-index: 999; }
.preview-review-banner { border: .6mm solid #a10f22; color: #7c0b1b; padding: 4mm;
	margin-bottom: 6mm; font-weight: 700; break-inside: avoid; }
.preview-review-footer { position: fixed; bottom: -13mm; left: 0; right: 0;
	text-align: center; color: #7c0b1b; font-size: 8pt; }
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
<h2>Vertragsparteien</h2><section class="parties"><div class="box"><strong>${escapeHtml(input.provider.fullName)}</strong><br>${input.provider.addressLines.map(escapeHtml).join('<br>')}${input.provider.registrationLines?.length ? `<br>${input.provider.registrationLines.map(escapeHtml).join('<br>')}` : ''}${input.provider.contactLines?.length ? `<br>${input.provider.contactLines.map(escapeHtml).join('<br>')}` : ''}</div>
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

function previewKindClauses(input: ContractRenderInput): string {
	const clauses: Record<ContractTemplateId, string> = {
		group_yearly: `<h2>Besondere Bedingungen für den Jahres-Gruppenunterricht</h2>
		<p>Der Unterricht wird als fortlaufendes Gruppenangebot für den im Angebot bezeichneten Zeitraum organisiert. Gesetzliche Feiertage, Schließzeiten und unterrichtsfreie Zeiten begründen nur dann einen Ersatztermin oder eine Preisänderung, wenn dies ausdrücklich vereinbart wurde.</p>
		<p>Eine automatische Verlängerung wird nur nach Maßgabe des im Angebot ausgewiesenen Klauselstands angewendet. Gesetzliche Kündigungsrechte und das Recht zur außerordentlichen Kündigung bleiben unberührt.</p>`,
		group_monthly: `<h2>Besondere Bedingungen für den monatlichen Gruppenunterricht</h2>
		<p>Der Unterricht wird als monatlich abgerechnetes Gruppenangebot erbracht. Beginn, Unterrichtszeiten und Gruppenbezeichnung ergeben sich aus dem unveränderlichen Angebotssnapshot.</p>
		<p>Die ordentliche Beendigung richtet sich nach der im Angebot genannten Frist. Bereits entstandene Zahlungsansprüche und gesetzliche Sonderrechte bleiben unberührt.</p>`,
		individual_hourly: `<h2>Besondere Bedingungen für individuellen Unterricht</h2>
		<p>Abgerechnet werden ausschließlich die nach dem vereinbarten Nachweisverfahren durchgeführten Unterrichtseinheiten. Terminänderungen und Ausfälle werden von der Verwaltung dokumentiert; eine automatische Abrechnung nicht erbrachter Einheiten findet nicht statt.</p>
		<p>Die im Angebot genannte Dauer einer Unterrichtseinheit und der Einheitspreis bilden gemeinsam die Abrechnungsgrundlage.</p>`,
		nachhilfe_hourly: `<h2>Besondere Bedingungen für geförderte Nachhilfe</h2>
		<p>Leistungszeitraum, Umfang und Vergütung stehen unter dem Vorbehalt der im Angebot bezeichneten Bewilligung. Gegenüber der Familie werden keine als Drittmittelleistung ausgewiesenen Beträge als Eigenanteil abgerechnet, soweit keine gesonderte wirksame Vereinbarung besteht.</p>
		<p>Änderungen, Ablauf oder Wegfall der Förderung werden vor einer Fortsetzung außerhalb der Bewilligung gesondert geklärt.</p>`,
	};
	return clauses[input.templateId];
}

function renderPreviewReviewBody(input: ContractRenderInput): string {
	const base = renderBody(input)
		.replace(`<style>${PRINT_CSS}</style>`, `<style>${PREVIEW_REVIEW_CSS}</style>`)
		.replace(
			/<body([^>]*)>/u,
			`<body$1><div class="preview-review-watermark">TEST/ENTWURF</div>
			<div class="preview-review-footer">TEST/ENTWURF — nicht für reale Vertragsbeziehungen</div>
			<div class="preview-review-banner">TEST/ENTWURF — ausschließlich für den geschützten Preview-Test mit synthetischen Daten. Keine Verwendung für reale Vertragsbeziehungen.</div>`
		);
	const clauses = `<section class="page-break"><h2>Allgemeine Vertragsbedingungen — interner Prüfstand</h2>
	<p><strong>Vertragsschluss.</strong> Dieses Dokument ist das unveränderliche Angebot des Vereins. Eine Elternannahme wird mit Zeitpunkt, Textversion und Dokument-Hash protokolliert. Der Vertrag wird erst durch die gesonderte administrative Bestätigung des Vereins aktiviert.</p>
	<p><strong>Leistung und Mitwirkung.</strong> Inhalt, Zeitraum, Terminrahmen und Preis ergeben sich aus dem Angebot. Änderungen bedürfen eines neuen nachvollziehbaren Stands. Sorgeberechtigte teilen relevante Terminänderungen über die vorgesehenen Portalwege mit.</p>
	<p><strong>Vergütung.</strong> Es gelten ausschließlich die ausgewiesenen Beträge, Einheiten und Zahlungsbedingungen. Dieses Vertragsdokument ist keine Rechnung und erteilt kein neues SEPA-Mandat.</p>
	<p><strong>Haftung.</strong> Die gesetzliche Haftung, insbesondere für Vorsatz, grobe Fahrlässigkeit sowie Verletzungen von Leben, Körper oder Gesundheit, wird durch diesen Prüfstand nicht beschränkt.</p>
	<p><strong>Datenschutz und Medien.</strong> Personenbezogene Daten werden nach dem bezeichneten Datenschutzhinweis verarbeitet. Eine Medienentscheidung ist freiwillig, vom Vertrag getrennt und jederzeit über die angegebenen Kontaktwege widerrufbar.</p>
	<p><strong>Widerruf.</strong> Soweit das angegebene Distanzgeschäftsprofil ein Widerrufsrecht vorsieht, gelten die bereitgestellte Widerrufsinformation und das gesetzliche Muster. Ein Wunsch nach vorzeitigem Leistungsbeginn und ein Wertersatzhinweis werden, soweit erforderlich, getrennt und beweisbar erfasst.</p>
	${previewKindClauses(input)}
	<h2>Widerrufsinformation — interner Prüfstand</h2>
	<p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Frist beginnt mit dem Tag des Vertragsschlusses. Zur Ausübung des Widerrufsrechts ist eine eindeutige Erklärung an Kinder- und Elternzentrum „Kolibri“ e. V., Ritzenbergstraße 3, 01067 Dresden, E-Mail: registration@kolibri-dresden.de erforderlich. Zur Fristwahrung genügt die rechtzeitige Absendung.</p>
	<p>Im Fall eines wirksamen Widerrufs werden empfangene Zahlungen grundsätzlich unverzüglich, spätestens binnen vierzehn Tagen ab Eingang der Widerrufserklärung, zurückgezahlt. Wurde ausdrücklich ein Leistungsbeginn während der Widerrufsfrist verlangt, kann für bis zum Widerruf vertragsgemäß erbrachte Leistungen ein gesetzlich zulässiger anteiliger Wertersatz anfallen.</p>
	<h2>Muster-Widerrufsformular</h2>
	<div class="box"><p>An: Kinder- und Elternzentrum „Kolibri“ e. V., Ritzenbergstraße 3, 01067 Dresden, registration@kolibri-dresden.de</p>
	<p>Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ____________________</p>
	<p>Vertrag geschlossen am: __________ &nbsp; Name: ____________________</p>
	<p>Anschrift: ____________________ &nbsp; Datum/Unterschrift (nur bei Mitteilung auf Papier): ____________________</p></div>
	<p class="notice"><strong>Interner Review-Hinweis:</strong> Klauseln, Fristen, Preise, Anlagen, Darstellung und Empfängertext sind anhand dieses real gerenderten PDFs zu prüfen. Freigaben für Produktion werden durch diesen Test nicht erteilt.</p></section>`;
	return base.replace('</body>', `${clauses}</body>`);
}

export const contractTemplateRegistry: Readonly<
	Record<ContractTemplateId, ContractTemplateDefinition>
> = Object.freeze(
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

export const previewReviewContractTemplateRegistry: Readonly<
	Record<ContractTemplateId, ContractTemplateDefinition>
> = Object.freeze(
	Object.fromEntries(
		(Object.keys(templateCopy) as ContractTemplateId[]).map((templateId) => [
			templateId,
			{
				templateId,
				templateVersion: PREVIEW_REVIEW_TEMPLATE_VERSION,
				renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
				css: PREVIEW_REVIEW_CSS,
				render: renderPreviewReviewBody,
			},
		])
	) as Record<ContractTemplateId, ContractTemplateDefinition>
);

export async function contractTemplateSourceHashes(
	template: ContractTemplateDefinition
): Promise<{ htmlSourceHash: string; cssSourceHash: string }> {
	const [htmlSourceHash, cssSourceHash] = await Promise.all([
		hashCanonical({ templateId: template.templateId, body: template.render.toString() }),
		hashCanonical({ css: template.css }),
	]);
	return { htmlSourceHash, cssSourceHash };
}

export async function renderContractSource(
	value: unknown,
	templateVersion = 'synthetic-core-v1'
): Promise<RenderedContractSource> {
	const input = contractRenderInputSchema.parse(value);
	const template =
		templateVersion === PREVIEW_REVIEW_TEMPLATE_VERSION
			? previewReviewContractTemplateRegistry[input.templateId]
			: contractTemplateRegistry[input.templateId];
	const canonicalInputJson = canonicalJson(input);
	const [renderInputHash, sourceHashes] = await Promise.all([
		hashCanonical(input),
		contractTemplateSourceHashes(template),
	]);
	const sourceManifest = {
		renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
		templateId: input.templateId,
		templateVersion: template.templateVersion,
		htmlSourceHash: sourceHashes.htmlSourceHash,
		cssSourceHash: sourceHashes.cssSourceHash,
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
