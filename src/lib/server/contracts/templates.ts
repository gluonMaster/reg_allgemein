import { z } from 'zod';
import { canonicalJson, hashCanonical } from '$lib/server/import/canonical';
import { sha256Bytes } from '$lib/server/security/digest';
import {
	CONTRACT_RENDER_SCHEMA_VERSION,
	contractRenderInputSchema,
	type ContractRenderInput,
	type ContractTemplateId,
} from './contracts';
import {
	DEJAVU_SANS_BOLD_CONTRACT_V1_BASE64,
	DEJAVU_SANS_BOLD_CONTRACT_V1_SHA256,
	DEJAVU_SANS_CONTRACT_V1_BASE64,
	DEJAVU_SANS_CONTRACT_V1_SHA256,
} from './dejavu-sans-subset';

const REGULAR_FONT_PLACEHOLDER = '__KOLIBRI_CONTRACT_FONT_REGULAR_V1__';
const BOLD_FONT_PLACEHOLDER = '__KOLIBRI_CONTRACT_FONT_BOLD_V1__';

const PRINT_CSS = `
@font-face { font-family: 'Kolibri Contract'; src: url('data:font/woff;base64,${REGULAR_FONT_PLACEHOLDER}') format('woff'); font-style: normal; font-weight: 400; font-display: block; }
@font-face { font-family: 'Kolibri Contract'; src: url('data:font/woff;base64,${BOLD_FONT_PLACEHOLDER}') format('woff'); font-style: normal; font-weight: 700; font-display: block; }
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #172033; font-family: 'Kolibri Contract'; font-size: 10.5pt; line-height: 1.45; }
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
export const PREVIEW_REVIEW_TEMPLATE_V2_VERSION = 'preview-review-v2' as const;
export const PREVIEW_REVIEW_CLAUSE_SET_VERSION = 'preview-review-clauses-v1' as const;
export const CONTRACT_TEMPLATE_BUNDLE_SCHEMA_VERSION = 'contract-render-source-bundle-v2' as const;
export const CONTRACT_HTML_RENDERER_V1 = 'contract-html-renderer-v1' as const;
export const CONTRACT_HTML_RENDERER_V2 = 'contract-html-renderer-v2' as const;
export const CONTRACT_TEMPLATE_IDS = [
	'group_yearly',
	'group_monthly',
	'individual_hourly',
	'nachhilfe_hourly',
] as const satisfies readonly ContractTemplateId[];

const PREVIEW_REVIEW_CSS = `${PRINT_CSS}
.preview-review-watermark { position: fixed; inset: 42% auto auto 4%; width: 92%;
	text-align: center; transform: rotate(-28deg); color: #a10f22; opacity: .13;
	font-size: 34pt; font-weight: 800; letter-spacing: .08em; z-index: 999; }
.preview-review-banner { border: .6mm solid #a10f22; color: #7c0b1b; padding: 4mm;
	margin-bottom: 6mm; font-weight: 700; break-inside: avoid; }
.preview-review-footer { position: fixed; bottom: -13mm; left: 0; right: 0;
	text-align: center; color: #7c0b1b; font-size: 8pt; }
`;

const BASE_BODY = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{{title}} {{contractNumber}}</title><style>{{css}}</style></head>
<body data-render-schema="{{renderSchemaVersion}}" data-template-id="{{templateId}}">{{previewPreamble}}
<header><p class="label">Vertragsangebot {{offerNumber}}</p><h1>{{title}}</h1></header>
<section class="meta"><div class="box"><span class="label">Vertragsnummer</span><br>{{contractNumber}}</div>
<div class="box"><span class="label">Leistungsbeginn</span><br>{{effectiveFrom}}{{effectiveTo}}</div></section>
<h2>Vertragsparteien</h2><section class="parties"><div class="box"><strong>{{providerName}}</strong><br>{{providerAddress}}{{providerExtra}}</div>
<div class="box"><strong>{{parentName}}</strong><br>{{parentAddress}}<br><span class="label">Vertragspartner für {{childName}}</span></div></section>
<h2>{{serviceTitle}}</h2><p><strong>{{subject}}</strong></p>{{schedule}}
<h2>{{billingLead}}</h2><div class="billing"><div class="box"><strong>{{finalPrice}}</strong>{{unitSuffix}}</div>
<div class="box">Zahlungsregel: {{paymentTerms}}{{paymentDue}}</div></div>
<ul>{{lineItems}}</ul>{{basePriceDisclaimer}}
<h2>{{termLead}}</h2><p>{{initialTerm}}</p><p>{{renewal}}</p>
<h2>Beendigung</h2><p>{{ordinaryTermination}}</p><p>{{extraordinaryTermination}}</p>
<section class="page-break"><h2>Vorvertragliche und datenschutzrechtliche Hinweise</h2>
<p>Datenschutzhinweis: {{privacyNotice}}. Die Kenntnisnahme wird unabhängig von der Vertragsannahme nachgewiesen.</p>
<p>Widerrufsinformation: {{withdrawalText}}. Rechtsprofil: {{distanceLegalProfile}}.</p>
{{mediaClause}}
<h2>Anlagen und Klauselstand</h2><p>Klauselstand {{clauseSet}}</p><ul>{{attachments}}</ul>
<p class="signature">Dieses Angebot wird im Portal durch ein separates, protokolliertes Elternhandeln angenommen. Der Vertrag entsteht erst durch die anschließende administrative Bestätigung des Vereins. Es werden keine Unterschriftsbilder erzeugt.</p></section>
{{previewAppendix}}</body></html>`;

const PREVIEW_APPENDIX = `<section class="page-break"><h2>Allgemeine Vertragsbedingungen — interner Prüfstand</h2>
<p><strong>Vertragsschluss.</strong> Dieses Dokument ist das unveränderliche Angebot des Vereins. Eine Elternannahme wird mit Zeitpunkt, Textversion und Dokument-Hash protokolliert. Der Vertrag wird erst durch die gesonderte administrative Bestätigung des Vereins aktiviert.</p>
<p><strong>Leistung und Mitwirkung.</strong> Inhalt, Zeitraum, Terminrahmen und Preis ergeben sich aus dem Angebot. Änderungen bedürfen eines neuen nachvollziehbaren Stands. Sorgeberechtigte teilen relevante Terminänderungen über die vorgesehenen Portalwege mit.</p>
<p><strong>Vergütung.</strong> Es gelten ausschließlich die ausgewiesenen Beträge, Einheiten und Zahlungsbedingungen. Dieses Vertragsdokument ist keine Rechnung und erteilt kein neues SEPA-Mandat.</p>
<p><strong>Haftung.</strong> Die gesetzliche Haftung, insbesondere für Vorsatz, grobe Fahrlässigkeit sowie Verletzungen von Leben, Körper oder Gesundheit, wird durch diesen Prüfstand nicht beschränkt.</p>
<p><strong>Datenschutz und Medien.</strong> Personenbezogene Daten werden nach dem bezeichneten Datenschutzhinweis verarbeitet. Eine Medienentscheidung ist freiwillig, vom Vertrag getrennt und jederzeit über die angegebenen Kontaktwege widerrufbar.</p>
<p><strong>Widerruf.</strong> Soweit das angegebene Distanzgeschäftsprofil ein Widerrufsrecht vorsieht, gelten die bereitgestellte Widerrufsinformation und das gesetzliche Muster. Ein Wunsch nach vorzeitigem Leistungsbeginn und ein Wertersatzhinweis werden, soweit erforderlich, getrennt und beweisbar erfasst.</p>
{{kindClause}}
<h2>Widerrufsinformation — interner Prüfstand</h2>
<p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Frist beginnt mit dem Tag des Vertragsschlusses. Zur Ausübung des Widerrufsrechts ist eine eindeutige Erklärung an Kinder- und Elternzentrum „Kolibri“ e. V., Ritzenbergstraße 3, 01067 Dresden, E-Mail: registration@kolibri-dresden.de erforderlich. Zur Fristwahrung genügt die rechtzeitige Absendung.</p>
<p>Im Fall eines wirksamen Widerrufs werden empfangene Zahlungen grundsätzlich unverzüglich, spätestens binnen vierzehn Tagen ab Eingang der Widerrufserklärung, zurückgezahlt. Wurde ausdrücklich ein Leistungsbeginn während der Widerrufsfrist verlangt, kann für bis zum Widerruf vertragsgemäß erbrachte Leistungen ein gesetzlich zulässiger anteiliger Wertersatz anfallen.</p>
<h2>Muster-Widerrufsformular</h2>
<div class="box"><p>An: Kinder- und Elternzentrum „Kolibri“ e. V., Ritzenbergstraße 3, 01067 Dresden, registration@kolibri-dresden.de</p>
<p>Hiermit widerrufe(n) ich/wir den von mir/uns abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ____________________</p>
<p>Vertrag geschlossen am: __________ &nbsp; Name: ____________________</p>
<p>Anschrift: ____________________ &nbsp; Datum/Unterschrift (nur bei Mitteilung auf Papier): ____________________</p></div>
<p class="notice"><strong>Interner Review-Hinweis:</strong> Klauseln, Fristen, Preise, Anlagen, Darstellung und Empfängertext sind anhand dieses real gerenderten PDFs zu prüfen. Freigaben für Produktion werden durch diesen Test nicht erteilt.</p></section>`;

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

const previewKindClauses: Record<ContractTemplateId, string> = {
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

const previewReviewTerms: Readonly<Record<ContractTemplateId, ContractRenderInput['term']>> =
	Object.freeze({
		group_yearly: {
			initialTermText:
				'Der Vertrag beginnt zum ausgewiesenen Leistungsbeginn und läuft zunächst für den vereinbarten Jahreszeitraum.',
			renewalText:
				'Nach der Erstlaufzeit wird der Vertrag nur nach dem im Prüfstand ausgewiesenen Verlängerungsmodell fortgesetzt; eine Verlängerung auf unbestimmte Zeit bleibt mit höchstens einmonatiger Frist kündbar.',
			ordinaryTerminationText:
				'Die ordentliche Kündigung ist zum Ende der Erstlaufzeit mit der ausgewiesenen Frist und nach einer Verlängerung mit höchstens einmonatiger Frist möglich.',
			extraordinaryTerminationText:
				'Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
		},
		group_monthly: {
			initialTermText:
				'Der Vertrag beginnt zum ausgewiesenen Leistungsbeginn und wird auf unbestimmte Zeit mit monatlicher Abrechnung geschlossen.',
			renewalText:
				'Eine gesonderte automatische Verlängerung findet nicht statt; der Vertrag läuft bis zu einer wirksamen Beendigung weiter.',
			ordinaryTerminationText:
				'Die ordentliche Kündigung ist mit einer Frist von einem Monat zum Monatsende möglich.',
			extraordinaryTerminationText:
				'Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
		},
		individual_hourly: {
			initialTermText:
				'Der Vertrag beginnt zum ausgewiesenen Leistungsbeginn; vergütet werden die dokumentiert durchgeführten Unterrichtseinheiten.',
			renewalText: 'Eine automatische feste Verlängerung findet nicht statt.',
			ordinaryTerminationText:
				'Die ordentliche Beendigung ist nach der im Angebot ausgewiesenen Vereinbarung für künftige Einheiten möglich.',
			extraordinaryTerminationText:
				'Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
		},
		nachhilfe_hourly: {
			initialTermText:
				'Der Vertrag gilt ausschließlich für den ausgewiesenen und bewilligten Förderzeitraum.',
			renewalText:
				'Eine Verlängerung setzt einen neuen dokumentierten Bewilligungs- und Vertragsstand voraus.',
			ordinaryTerminationText:
				'Der Vertrag endet spätestens mit Ablauf des ausgewiesenen Förderzeitraums; weitergehende Beendigungsrechte bleiben unberührt.',
			extraordinaryTerminationText:
				'Das Recht beider Parteien zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
		},
	});

const previewReviewLegalDefaults = Object.freeze({
	attachments: ['Datenschutzhinweis', 'Widerrufsinformation und Muster-Widerrufsformular'],
	privacyNoticeVersion: 'preview-review-privacy-v1',
	withdrawalTextVersion: 'preview-review-withdrawal-v1',
	earlyPerformanceRequestVersion: 'preview-review-early-performance-v1',
	wertersatzNoticeVersion: 'preview-review-wertersatz-v1',
	mediaClauseVersion: 'preview-review-media-text-v1',
});

const fixedCopy = Object.freeze({
	scheduleFallback: 'Die konkrete Terminabstimmung erfolgt mit der Verwaltung.',
	basePriceDisclaimer:
		'Der ausgewiesene Gruppenpreis ist ein Grundpreis. Ferien, anteilige Zeiträume und weitere externe Anpassungen werden im Portal nicht berechnet; dieses Dokument ist keine Rechnung.',
	previewWatermark: 'TEST/ENTWURF',
	previewFooter: 'TEST/ENTWURF — nicht für reale Vertragsbeziehungen',
	previewBanner:
		'TEST/ENTWURF — ausschließlich für den geschützten Preview-Test mit synthetischen Daten. Keine Verwendung für reale Vertragsbeziehungen.',
});

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const manifestEntrySchema = z
	.object({
		id: z.string().min(1),
		mediaType: z.string().min(1),
		sha256: sha256Schema,
		dataBase64: z
			.string()
			.regex(/^[A-Za-z0-9+/]+={0,2}$/u)
			.max(2 * 1024 * 1024),
	})
	.strict();
const bundleSchema = z
	.object({
		bundleSchemaVersion: z.literal(CONTRACT_TEMPLATE_BUNDLE_SCHEMA_VERSION),
		templateId: z.enum(CONTRACT_TEMPLATE_IDS),
		templateVersion: z.string().min(1),
		renderSchemaVersion: z.string().min(1),
		usageScope: z.enum(['synthetic_test', 'preview_review', 'production']),
		clauseSetVersion: z.string().min(1),
		helpers: z
			.object({
				htmlEscapeVersion: z.string().min(1),
				currencyFormatVersion: z.string().min(1),
				tokenInterpolationVersion: z.string().min(1),
				embeddedResourceVersion: z.string().min(1),
			})
			.strict(),
		renderer: z
			.object({
				engineVersion: z.string().min(1),
				rendererId: z.string().min(1),
				adapterContractVersion: z.string().min(1),
				workerCompatibilityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
			})
			.strict(),
		snapshots: z
			.object({
				providerSnapshotHash: sha256Schema,
				paymentTermsHash: sha256Schema,
				legalSnapshotHash: sha256Schema,
				mediaSnapshotHash: sha256Schema,
			})
			.strict(),
		source: z
			.object({
				baseBody: z.string().min(1),
				kindClause: z.string(),
				previewAppendix: z.string(),
				fixedCopy: z
					.object({
						scheduleFallback: z.string().min(1),
						basePriceDisclaimer: z.string().min(1),
						previewWatermark: z.string().min(1),
						previewFooter: z.string().min(1),
						previewBanner: z.string().min(1),
					})
					.strict(),
				kindCopy: z
					.object({
						title: z.string().min(1),
						serviceTitle: z.string().min(1),
						billingLead: z.string().min(1),
						termLead: z.string().min(1),
					})
					.strict(),
				previewOverrides: z
					.object({
						term: z
							.object({
								initialTermText: z.string().min(1),
								renewalText: z.string().min(1),
								ordinaryTerminationText: z.string().min(1),
								extraordinaryTerminationText: z.string().min(1),
							})
							.strict(),
						legal: z
							.object({
								attachments: z.array(z.string().min(1)),
								privacyNoticeVersion: z.string().min(1),
								withdrawalTextVersion: z.string().min(1),
								earlyPerformanceRequestVersion: z.string().min(1),
								wertersatzNoticeVersion: z.string().min(1),
								mediaClauseVersion: z.string().min(1),
							})
							.strict(),
					})
					.strict()
					.nullable(),
				css: z.string().min(1),
			})
			.strict(),
		fonts: z.array(manifestEntrySchema),
		assets: z.array(manifestEntrySchema),
		requiredFields: z.array(z.string().min(1)),
	})
	.strict();

export interface ContractTemplateBundle {
	bundleSchemaVersion: string;
	templateId: ContractTemplateId;
	templateVersion: string;
	renderSchemaVersion: string;
	usageScope: 'synthetic_test' | 'preview_review' | 'production';
	clauseSetVersion: string;
	helpers: {
		htmlEscapeVersion: string;
		currencyFormatVersion: string;
		tokenInterpolationVersion: string;
		embeddedResourceVersion: string;
	};
	renderer: {
		engineVersion: string;
		rendererId: string;
		adapterContractVersion: string;
		workerCompatibilityDate: string;
	};
	snapshots: {
		providerSnapshotHash: string;
		paymentTermsHash: string;
		legalSnapshotHash: string;
		mediaSnapshotHash: string;
	};
	source: {
		baseBody: string;
		kindClause: string;
		previewAppendix: string;
		fixedCopy: {
			scheduleFallback: string;
			basePriceDisclaimer: string;
			previewWatermark: string;
			previewFooter: string;
			previewBanner: string;
		};
		kindCopy: { title: string; serviceTitle: string; billingLead: string; termLead: string };
		previewOverrides: {
			term: ContractRenderInput['term'];
			legal: {
				attachments: string[];
				privacyNoticeVersion: string;
				withdrawalTextVersion: string;
				earlyPerformanceRequestVersion: string;
				wertersatzNoticeVersion: string;
				mediaClauseVersion: string;
			};
		} | null;
		css: string;
	};
	fonts: Array<{ id: string; mediaType: string; sha256: string; dataBase64: string }>;
	assets: Array<{ id: string; mediaType: string; sha256: string; dataBase64: string }>;
	requiredFields: string[];
}

export class ContractTemplateBundleError extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'ContractTemplateBundleError';
	}
}

export function buildContractTemplateBundle(input: {
	templateId: ContractTemplateId;
	templateVersion: string;
	usageScope: 'synthetic_test' | 'preview_review' | 'production';
	snapshotHashes: ContractTemplateBundle['snapshots'];
}): ContractTemplateBundle {
	const previewReview = input.usageScope === 'preview_review';
	const rendererEngineVersion =
		input.templateVersion === PREVIEW_REVIEW_TEMPLATE_V2_VERSION
			? CONTRACT_HTML_RENDERER_V2
			: CONTRACT_HTML_RENDERER_V1;
	const rendererEngineV2 = rendererEngineVersion === CONTRACT_HTML_RENDERER_V2;
	return {
		bundleSchemaVersion: CONTRACT_TEMPLATE_BUNDLE_SCHEMA_VERSION,
		templateId: input.templateId,
		templateVersion: input.templateVersion,
		renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
		usageScope: input.usageScope,
		clauseSetVersion: previewReview ? PREVIEW_REVIEW_CLAUSE_SET_VERSION : 'synthetic-clause-v1',
		helpers: {
			htmlEscapeVersion: rendererEngineV2 ? 'escape-html-v2' : 'escape-html-v1',
			currencyFormatVersion: rendererEngineV2
				? 'deterministic-de-de-eur-v2'
				: 'deterministic-de-de-eur-v1',
			tokenInterpolationVersion: rendererEngineV2 ? 'interp-v2' : 'interp-v1',
			embeddedResourceVersion: 'embedded-data-resource-v1',
		},
		renderer: {
			engineVersion: rendererEngineVersion,
			rendererId: previewReview ? 'cloudflare-browser-run-pdf-v1' : 'synthetic-test-pdf-v1',
			adapterContractVersion: 'pdf-adapter-v1',
			workerCompatibilityDate: '2026-03-24',
		},
		snapshots: { ...input.snapshotHashes },
		source: {
			baseBody: BASE_BODY,
			kindClause: previewReview ? previewKindClauses[input.templateId] : '',
			previewAppendix: previewReview ? PREVIEW_APPENDIX : '',
			fixedCopy: { ...fixedCopy },
			kindCopy: { ...templateCopy[input.templateId] },
			previewOverrides: previewReview
				? {
						term: { ...previewReviewTerms[input.templateId] },
						legal: {
							...previewReviewLegalDefaults,
							attachments: [...previewReviewLegalDefaults.attachments],
						},
					}
				: null,
			css: previewReview ? PREVIEW_REVIEW_CSS : PRINT_CSS,
		},
		fonts: [
			{
				id: 'dejavu-sans-contract-regular-v1',
				mediaType: 'font/woff',
				sha256: DEJAVU_SANS_CONTRACT_V1_SHA256,
				dataBase64: DEJAVU_SANS_CONTRACT_V1_BASE64,
			},
			{
				id: 'dejavu-sans-contract-bold-v1',
				mediaType: 'font/woff',
				sha256: DEJAVU_SANS_BOLD_CONTRACT_V1_SHA256,
				dataBase64: DEJAVU_SANS_BOLD_CONTRACT_V1_BASE64,
			},
		],
		assets: [],
		requiredFields: previewReview ? ['previewReviewMarker'] : [],
	};
}

function parseSchemaBundle(value: unknown): ContractTemplateBundle {
	const parsed = bundleSchema.safeParse(value);
	if (!parsed.success)
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	return parsed.data as ContractTemplateBundle;
}

function parseSupportedBundle(value: unknown): ContractTemplateBundle {
	const bundle = parseSchemaBundle(value);
	if (!contractHtmlRenderers[bundle.renderer.engineVersion]) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_RENDERER_UNSUPPORTED');
	}
	const supported = supportedTemplateVersions[bundle.templateVersion];
	if (
		!supported ||
		bundle.usageScope !== supported.usageScope ||
		bundle.clauseSetVersion !== supported.clauseSetVersion ||
		bundle.renderSchemaVersion !== CONTRACT_RENDER_SCHEMA_VERSION ||
		bundle.renderer.engineVersion !== supported.rendererEngineVersion ||
		bundle.helpers.htmlEscapeVersion !== supported.htmlEscapeVersion ||
		bundle.helpers.currencyFormatVersion !== supported.currencyFormatVersion ||
		bundle.helpers.tokenInterpolationVersion !== supported.tokenInterpolationVersion ||
		bundle.helpers.embeddedResourceVersion !== 'embedded-data-resource-v1' ||
		bundle.renderer.rendererId !== supported.rendererId ||
		bundle.renderer.adapterContractVersion !== 'pdf-adapter-v1' ||
		bundle.renderer.workerCompatibilityDate !== '2026-03-24' ||
		bundle.fonts.length !== 2 ||
		bundle.fonts[0]?.id !== 'dejavu-sans-contract-regular-v1' ||
		bundle.fonts[0]?.mediaType !== 'font/woff' ||
		bundle.fonts[0]?.sha256 !== DEJAVU_SANS_CONTRACT_V1_SHA256 ||
		bundle.fonts[1]?.id !== 'dejavu-sans-contract-bold-v1' ||
		bundle.fonts[1]?.mediaType !== 'font/woff' ||
		bundle.fonts[1]?.sha256 !== DEJAVU_SANS_BOLD_CONTRACT_V1_SHA256 ||
		bundle.assets.length !== 0 ||
		(bundle.usageScope === 'preview_review') !== Boolean(bundle.source.previewOverrides)
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	return bundle;
}

const supportedTemplateVersions: Readonly<
	Record<
		string,
		{
			usageScope: 'synthetic_test' | 'preview_review';
			clauseSetVersion: string;
			rendererId: 'synthetic-test-pdf-v1' | 'cloudflare-browser-run-pdf-v1';
			rendererEngineVersion:
				| typeof CONTRACT_HTML_RENDERER_V1
				| typeof CONTRACT_HTML_RENDERER_V2;
			htmlEscapeVersion: 'escape-html-v1' | 'escape-html-v2';
			currencyFormatVersion:
				| 'deterministic-de-de-eur-v1'
				| 'deterministic-de-de-eur-v2';
			tokenInterpolationVersion: 'interp-v1' | 'interp-v2';
		}
	>
> = Object.freeze({
	'synthetic-core-v1': {
		usageScope: 'synthetic_test',
		clauseSetVersion: 'synthetic-clause-v1',
		rendererId: 'synthetic-test-pdf-v1',
		rendererEngineVersion: CONTRACT_HTML_RENDERER_V1,
		htmlEscapeVersion: 'escape-html-v1',
		currencyFormatVersion: 'deterministic-de-de-eur-v1',
		tokenInterpolationVersion: 'interp-v1',
	},
	'synthetic-withdrawal-v1': {
		usageScope: 'synthetic_test',
		clauseSetVersion: 'synthetic-clause-v1',
		rendererId: 'synthetic-test-pdf-v1',
		rendererEngineVersion: CONTRACT_HTML_RENDERER_V1,
		htmlEscapeVersion: 'escape-html-v1',
		currencyFormatVersion: 'deterministic-de-de-eur-v1',
		tokenInterpolationVersion: 'interp-v1',
	},
	[PREVIEW_REVIEW_TEMPLATE_VERSION]: {
		usageScope: 'preview_review',
		clauseSetVersion: PREVIEW_REVIEW_CLAUSE_SET_VERSION,
		rendererId: 'cloudflare-browser-run-pdf-v1',
		rendererEngineVersion: CONTRACT_HTML_RENDERER_V1,
		htmlEscapeVersion: 'escape-html-v1',
		currencyFormatVersion: 'deterministic-de-de-eur-v1',
		tokenInterpolationVersion: 'interp-v1',
	},
	[PREVIEW_REVIEW_TEMPLATE_V2_VERSION]: {
		usageScope: 'preview_review',
		clauseSetVersion: PREVIEW_REVIEW_CLAUSE_SET_VERSION,
		rendererId: 'cloudflare-browser-run-pdf-v1',
		rendererEngineVersion: CONTRACT_HTML_RENDERER_V2,
		htmlEscapeVersion: 'escape-html-v2',
		currencyFormatVersion: 'deterministic-de-de-eur-v2',
		tokenInterpolationVersion: 'interp-v2',
	},
});

export function serializeContractTemplateBundle(
	bundle: ContractTemplateBundle
): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(canonicalJson(parseSchemaBundle(bundle)));
}

export function contractTemplateResourceManifest(
	entries: ReadonlyArray<ContractTemplateBundle['fonts'][number]>
): string {
	return canonicalJson({
		entries: entries.map(({ id, mediaType, sha256 }) => ({ id, mediaType, sha256 })),
	});
}

export function parseContractTemplateBundle(
	value: Uint8Array | ArrayBuffer | string | unknown,
	expected?: {
		templateId: ContractTemplateId;
		templateVersion: string;
		renderSchemaVersion: string;
	}
): ContractTemplateBundle {
	let decoded: unknown = value;
	try {
		if (value instanceof Uint8Array) decoded = JSON.parse(new TextDecoder().decode(value));
		else if (value instanceof ArrayBuffer)
			decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(value)));
		else if (typeof value === 'string' && value.trim().startsWith('{'))
			decoded = JSON.parse(value);
	} catch {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_INVALID');
	}
	const bundle = parseSupportedBundle(decoded);
	if (
		expected &&
		(bundle.templateId !== expected.templateId ||
			bundle.templateVersion !== expected.templateVersion ||
			bundle.renderSchemaVersion !== expected.renderSchemaVersion)
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_MISMATCH');
	}
	return bundle;
}

export async function contractTemplateBundleHashes(bundle: ContractTemplateBundle): Promise<{
	bundleHash: string;
	htmlSourceHash: string;
	cssSourceHash: string;
}> {
	const supported = parseSchemaBundle(bundle);
	await assertEmbeddedResourceHashes(supported);
	const bytes = serializeContractTemplateBundle(supported);
	const [bundleHash, htmlSourceHash, cssSourceHash] = await Promise.all([
		sha256Bytes(bytes),
		hashCanonical({
			clauseSetVersion: supported.clauseSetVersion,
			baseBody: supported.source.baseBody,
			kindClause: supported.source.kindClause,
			previewAppendix: supported.source.previewAppendix,
			fixedCopy: supported.source.fixedCopy,
			kindCopy: supported.source.kindCopy,
			previewOverrides: supported.source.previewOverrides,
			helpers: supported.helpers,
			rendererEngineVersion: supported.renderer.engineVersion,
			renderSchemaVersion: supported.renderSchemaVersion,
		}),
		hashCanonical({
			css: supported.source.css,
			fonts: supported.fonts,
			assets: supported.assets,
		}),
	]);
	return { bundleHash, htmlSourceHash, cssSourceHash };
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
	try {
		const decoded = atob(value);
		return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
	} catch {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_INVALID');
	}
}

async function assertEmbeddedResourceHashes(bundle: ContractTemplateBundle): Promise<void> {
	await Promise.all(
		[...bundle.fonts, ...bundle.assets].map(async (entry) => {
			if ((await sha256Bytes(decodeBase64(entry.dataBase64))) !== entry.sha256) {
				throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_MISMATCH');
			}
		})
	);
}

function escapeHtmlV1(value: unknown): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function moneyV1(cents: number): string {
	const sign = cents < 0 ? '-' : '';
	const absoluteCents = Math.abs(cents);
	const euros = Math.floor(absoluteCents / 100)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
	const remainder = (absoluteCents % 100).toString().padStart(2, '0');
	return `${sign}${euros},${remainder}\u00a0€`;
}

function interpolateV1(source: string, values: Readonly<Record<string, string>>): string {
	const rendered = source.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu, (_match, key: string) => {
		const value = values[key];
		if (value === undefined)
			throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
		return value;
	});
	if (/\{\{[^{}]+\}\}/u.test(rendered)) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	return rendered;
}

function renderBundleCssV1(bundle: ContractTemplateBundle): string {
	const [regular, bold] = bundle.fonts;
	if (
		bundle.fonts.length !== 2 ||
		bundle.assets.length !== 0 ||
		regular?.id !== 'dejavu-sans-contract-regular-v1' ||
		regular.mediaType !== 'font/woff' ||
		regular.sha256 !== DEJAVU_SANS_CONTRACT_V1_SHA256 ||
		bold?.id !== 'dejavu-sans-contract-bold-v1' ||
		bold.mediaType !== 'font/woff' ||
		bold.sha256 !== DEJAVU_SANS_BOLD_CONTRACT_V1_SHA256
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	const css = bundle.source.css
		.replaceAll(REGULAR_FONT_PLACEHOLDER, regular.dataBase64)
		.replaceAll(BOLD_FONT_PLACEHOLDER, bold.dataBase64);
	if (css.includes(REGULAR_FONT_PLACEHOLDER) || css.includes(BOLD_FONT_PLACEHOLDER)) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	return css;
}

function renderBundleHtmlV1(input: ContractRenderInput, bundle: ContractTemplateBundle): string {
	const copy = bundle.source.kindCopy;
	const schedule = input.service.scheduleLines.length
		? `<ul>${input.service.scheduleLines.map((line) => `<li>${escapeHtmlV1(line)}</li>`).join('')}</ul>`
		: `<p>${escapeHtmlV1(bundle.source.fixedCopy.scheduleFallback)}</p>`;
	const lineItems = input.billing.lineItems
		.map(
			(item) =>
				`<li><strong>${escapeHtmlV1(item.description)}:</strong> ${escapeHtmlV1(moneyV1(item.amountCents))} — ${escapeHtmlV1(item.basis)}</li>`
		)
		.join('');
	const previewReview = bundle.usageScope === 'preview_review';
	const previewPreamble = previewReview
		? `<div class="preview-review-watermark">${escapeHtmlV1(bundle.source.fixedCopy.previewWatermark)}</div>
<div class="preview-review-footer">${escapeHtmlV1(bundle.source.fixedCopy.previewFooter)}</div>
<div class="preview-review-banner">${escapeHtmlV1(bundle.source.fixedCopy.previewBanner)}</div>`
		: '';
	const previewAppendix = previewReview
		? interpolateV1(bundle.source.previewAppendix, { kindClause: bundle.source.kindClause })
		: '';
	return interpolateV1(bundle.source.baseBody, {
		title: escapeHtmlV1(copy.title),
		contractNumber: escapeHtmlV1(input.contractNumber),
		css: renderBundleCssV1(bundle),
		renderSchemaVersion: escapeHtmlV1(bundle.renderSchemaVersion),
		templateId: escapeHtmlV1(bundle.templateId),
		previewPreamble,
		offerNumber: escapeHtmlV1(input.offerNumber),
		effectiveFrom: escapeHtmlV1(input.service.effectiveFrom),
		effectiveTo: input.service.effectiveTo
			? ` bis einschließlich ${escapeHtmlV1(input.service.effectiveTo)}`
			: '',
		providerName: escapeHtmlV1(input.provider.fullName),
		providerAddress: input.provider.addressLines.map(escapeHtmlV1).join('<br>'),
		providerExtra: [input.provider.registrationLines, input.provider.contactLines]
			.flatMap((lines) => lines ?? [])
			.map((line) => `<br>${escapeHtmlV1(line)}`)
			.join(''),
		parentName: escapeHtmlV1(input.parent.fullName),
		parentAddress: input.parent.addressLines.map(escapeHtmlV1).join('<br>'),
		childName: escapeHtmlV1(input.child.fullName),
		serviceTitle: escapeHtmlV1(copy.serviceTitle),
		subject: escapeHtmlV1(input.service.subject),
		schedule,
		billingLead: escapeHtmlV1(copy.billingLead),
		finalPrice: escapeHtmlV1(moneyV1(input.billing.finalPriceCents)),
		unitSuffix: input.billing.unitMinutes
			? ` je ${input.billing.unitMinutes} Minuten`
			: ' monatlich',
		paymentTerms: escapeHtmlV1(input.provider.paymentTermsVersion),
		paymentDue: input.billing.paymentDueDay
			? `<br>Fälligkeit spätestens am ${input.billing.paymentDueDay}. des Folgemonats.`
			: '',
		lineItems,
		basePriceDisclaimer: input.billing.basePriceDisclaimer
			? `<p class="notice">${escapeHtmlV1(bundle.source.fixedCopy.basePriceDisclaimer)}</p>`
			: '',
		termLead: escapeHtmlV1(copy.termLead),
		initialTerm: escapeHtmlV1(input.term.initialTermText),
		renewal: escapeHtmlV1(input.term.renewalText),
		ordinaryTermination: escapeHtmlV1(input.term.ordinaryTerminationText),
		extraordinaryTermination: escapeHtmlV1(input.term.extraordinaryTerminationText),
		privacyNotice: escapeHtmlV1(input.legal.privacyNoticeVersion),
		withdrawalText: escapeHtmlV1(input.legal.withdrawalTextVersion),
		distanceLegalProfile: escapeHtmlV1(input.legal.distanceLegalProfile),
		mediaClause: input.legal.mediaClauseVersion
			? `<p>Medienhinweis: ${escapeHtmlV1(input.legal.mediaClauseVersion)}. Eine Entscheidung hierzu ist freiwillig und von der Vertragsannahme getrennt.</p>`
			: '',
		clauseSet: escapeHtmlV1(input.legal.clauseSetVersion),
		attachments: input.legal.attachments
			.map((item) => `<li>${escapeHtmlV1(item)}</li>`)
			.join(''),
		previewAppendix,
	});
}

// Renderer engines are intentionally duplicated instead of sharing output-affecting
// helpers. Once an engine version is registered, changes for a later engine cannot
// alter the executable path used by an already stored bundle.
function escapeHtmlV2(value: unknown): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function moneyV2(cents: number): string {
	const sign = cents < 0 ? '-' : '';
	const absoluteCents = Math.abs(cents);
	const euros = Math.floor(absoluteCents / 100)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
	const remainder = (absoluteCents % 100).toString().padStart(2, '0');
	return `${sign}${euros},${remainder}\u00a0EUR`;
}

function interpolateV2(source: string, values: Readonly<Record<string, string>>): string {
	const rendered = source.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu, (_match, key: string) => {
		const value = values[key];
		if (value === undefined)
			throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
		return value;
	});
	if (/\{\{[^{}]+\}\}/u.test(rendered)) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	return rendered;
}

function renderBundleCssV2(bundle: ContractTemplateBundle): string {
	const [regular, bold] = bundle.fonts;
	if (
		bundle.fonts.length !== 2 ||
		bundle.assets.length !== 0 ||
		regular?.id !== 'dejavu-sans-contract-regular-v1' ||
		regular.mediaType !== 'font/woff' ||
		regular.sha256 !== DEJAVU_SANS_CONTRACT_V1_SHA256 ||
		bold?.id !== 'dejavu-sans-contract-bold-v1' ||
		bold.mediaType !== 'font/woff' ||
		bold.sha256 !== DEJAVU_SANS_BOLD_CONTRACT_V1_SHA256
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	const css = bundle.source.css
		.replaceAll('__KOLIBRI_CONTRACT_FONT_REGULAR_V1__', regular.dataBase64)
		.replaceAll('__KOLIBRI_CONTRACT_FONT_BOLD_V1__', bold.dataBase64);
	if (
		css.includes('__KOLIBRI_CONTRACT_FONT_REGULAR_V1__') ||
		css.includes('__KOLIBRI_CONTRACT_FONT_BOLD_V1__')
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_UNSUPPORTED');
	}
	return css;
}

function renderBundleHtmlV2(input: ContractRenderInput, bundle: ContractTemplateBundle): string {
	const copy = bundle.source.kindCopy;
	const schedule = input.service.scheduleLines.length
		? `<ul>${input.service.scheduleLines.map((line) => `<li>${escapeHtmlV2(line)}</li>`).join('')}</ul>`
		: `<p>${escapeHtmlV2(bundle.source.fixedCopy.scheduleFallback)}</p>`;
	const lineItems = input.billing.lineItems
		.map(
			(item) =>
				`<li><strong>${escapeHtmlV2(item.description)}:</strong> ${escapeHtmlV2(moneyV2(item.amountCents))} — ${escapeHtmlV2(item.basis)}</li>`
		)
		.join('');
	const previewReview = bundle.usageScope === 'preview_review';
	const previewPreamble = previewReview
		? `<div class="preview-review-watermark">${escapeHtmlV2(bundle.source.fixedCopy.previewWatermark)}</div>
<div class="preview-review-footer">${escapeHtmlV2(bundle.source.fixedCopy.previewFooter)}</div>
<div class="preview-review-banner">${escapeHtmlV2(bundle.source.fixedCopy.previewBanner)}</div>`
		: '';
	const previewAppendix = previewReview
		? interpolateV2(bundle.source.previewAppendix, { kindClause: bundle.source.kindClause })
		: '';
	return interpolateV2(bundle.source.baseBody, {
		title: escapeHtmlV2(copy.title),
		contractNumber: escapeHtmlV2(input.contractNumber),
		css: renderBundleCssV2(bundle),
		renderSchemaVersion: escapeHtmlV2(bundle.renderSchemaVersion),
		templateId: escapeHtmlV2(bundle.templateId),
		previewPreamble,
		offerNumber: escapeHtmlV2(input.offerNumber),
		effectiveFrom: escapeHtmlV2(input.service.effectiveFrom),
		effectiveTo: input.service.effectiveTo
			? ` bis einschließlich ${escapeHtmlV2(input.service.effectiveTo)}`
			: '',
		providerName: escapeHtmlV2(input.provider.fullName),
		providerAddress: input.provider.addressLines.map(escapeHtmlV2).join('<br>'),
		providerExtra: [input.provider.registrationLines, input.provider.contactLines]
			.flatMap((lines) => lines ?? [])
			.map((line) => `<br>${escapeHtmlV2(line)}`)
			.join(''),
		parentName: escapeHtmlV2(input.parent.fullName),
		parentAddress: input.parent.addressLines.map(escapeHtmlV2).join('<br>'),
		childName: escapeHtmlV2(input.child.fullName),
		serviceTitle: escapeHtmlV2(copy.serviceTitle),
		subject: escapeHtmlV2(input.service.subject),
		schedule,
		billingLead: escapeHtmlV2(copy.billingLead),
		finalPrice: escapeHtmlV2(moneyV2(input.billing.finalPriceCents)),
		unitSuffix: input.billing.unitMinutes
			? ` je ${input.billing.unitMinutes} Minuten`
			: ' monatlich',
		paymentTerms: escapeHtmlV2(input.provider.paymentTermsVersion),
		paymentDue: input.billing.paymentDueDay
			? `<br>Fälligkeit spätestens am ${input.billing.paymentDueDay}. des Folgemonats.`
			: '',
		lineItems,
		basePriceDisclaimer: input.billing.basePriceDisclaimer
			? `<p class="notice">${escapeHtmlV2(bundle.source.fixedCopy.basePriceDisclaimer)}</p>`
			: '',
		termLead: escapeHtmlV2(copy.termLead),
		initialTerm: escapeHtmlV2(input.term.initialTermText),
		renewal: escapeHtmlV2(input.term.renewalText),
		ordinaryTermination: escapeHtmlV2(input.term.ordinaryTerminationText),
		extraordinaryTermination: escapeHtmlV2(input.term.extraordinaryTerminationText),
		privacyNotice: escapeHtmlV2(input.legal.privacyNoticeVersion),
		withdrawalText: escapeHtmlV2(input.legal.withdrawalTextVersion),
		distanceLegalProfile: escapeHtmlV2(input.legal.distanceLegalProfile),
		mediaClause: input.legal.mediaClauseVersion
			? `<p>Medienhinweis: ${escapeHtmlV2(input.legal.mediaClauseVersion)}. Eine Entscheidung hierzu ist freiwillig und von der Vertragsannahme getrennt.</p>`
			: '',
		clauseSet: escapeHtmlV2(input.legal.clauseSetVersion),
		attachments: input.legal.attachments
			.map((item) => `<li>${escapeHtmlV2(item)}</li>`)
			.join(''),
		previewAppendix,
	});
}

type ContractHtmlRenderer = (
	input: ContractRenderInput,
	bundle: ContractTemplateBundle
) => string;

const contractHtmlRenderers: Readonly<Record<string, ContractHtmlRenderer>> = Object.freeze({
	[CONTRACT_HTML_RENDERER_V1]: renderBundleHtmlV1,
	[CONTRACT_HTML_RENDERER_V2]: renderBundleHtmlV2,
});

function renderBundleWithVersionedEngine(
	input: ContractRenderInput,
	bundle: ContractTemplateBundle
): string {
	const renderer = contractHtmlRenderers[bundle.renderer.engineVersion];
	if (!renderer) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_RENDERER_UNSUPPORTED');
	}
	return renderer(input, bundle);
}

export interface RenderedContractSource {
	html: string;
	canonicalInputJson: string;
	renderInputHash: string;
	sourceManifest: {
		renderSchemaVersion: string;
		rendererEngineVersion: string;
		templateId: ContractTemplateId;
		templateVersion: string;
		bundleHash: string;
		bundleSizeBytes: number;
		htmlSourceHash: string;
		cssSourceHash: string;
		renderedHtmlHash: string;
		inputHash: string;
		snapshotHashes: ContractTemplateBundle['snapshots'];
	};
	sourceManifestHash: string;
}

export async function renderContractSource(
	value: unknown,
	templateSource: ContractTemplateBundle | null | undefined
): Promise<RenderedContractSource> {
	if (templateSource == null) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_MISSING');
	}
	const input = contractRenderInputSchema.parse(value);
	const bundle = parseSupportedBundle(templateSource);
	if (
		bundle.templateId !== input.templateId ||
		bundle.renderSchemaVersion !== input.schemaVersion ||
		bundle.clauseSetVersion !== input.legal.clauseSetVersion ||
		(bundle.usageScope === 'preview_review') !==
			(input.previewReviewMarker === 'synthetic-no-pii')
	) {
		throw new ContractTemplateBundleError('CONTRACT_TEMPLATE_SOURCE_MISMATCH');
	}
	const canonicalInputJson = canonicalJson(input);
	const html = renderBundleWithVersionedEngine(input, bundle);
	const [renderInputHash, sourceHashes, renderedHtmlHash] = await Promise.all([
		hashCanonical(input),
		contractTemplateBundleHashes(bundle),
		sha256Bytes(new TextEncoder().encode(html)),
	]);
	const sourceManifest = {
		renderSchemaVersion: bundle.renderSchemaVersion,
		rendererEngineVersion: bundle.renderer.engineVersion,
		templateId: input.templateId,
		templateVersion: bundle.templateVersion,
		bundleHash: sourceHashes.bundleHash,
		bundleSizeBytes: serializeContractTemplateBundle(bundle).byteLength,
		htmlSourceHash: sourceHashes.htmlSourceHash,
		cssSourceHash: sourceHashes.cssSourceHash,
		renderedHtmlHash,
		inputHash: renderInputHash,
		snapshotHashes: { ...bundle.snapshots },
	};
	return {
		html,
		canonicalInputJson,
		renderInputHash,
		sourceManifest,
		sourceManifestHash: await hashCanonical(sourceManifest),
	};
}
