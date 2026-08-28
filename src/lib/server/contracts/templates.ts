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
export const PREVIEW_REVIEW_CLAUSE_SET_VERSION = 'preview-review-clauses-v1' as const;
export const CONTRACT_TEMPLATE_BUNDLE_SCHEMA_VERSION = 'contract-render-source-bundle-v1' as const;
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
	return {
		bundleSchemaVersion: CONTRACT_TEMPLATE_BUNDLE_SCHEMA_VERSION,
		templateId: input.templateId,
		templateVersion: input.templateVersion,
		renderSchemaVersion: CONTRACT_RENDER_SCHEMA_VERSION,
		usageScope: input.usageScope,
		clauseSetVersion: previewReview ? PREVIEW_REVIEW_CLAUSE_SET_VERSION : 'synthetic-clause-v1',
		helpers: {
			htmlEscapeVersion: 'escape-html-v1',
			currencyFormatVersion: 'intl-de-de-eur-v1',
			tokenInterpolationVersion: 'interp-v1',
			embeddedResourceVersion: 'embedded-data-resource-v1',
		},
		renderer: {
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
	const supported = supportedTemplateVersions[bundle.templateVersion];
	if (
		!supported ||
		bundle.usageScope !== supported.usageScope ||
		bundle.clauseSetVersion !== supported.clauseSetVersion ||
		bundle.renderSchemaVersion !== CONTRACT_RENDER_SCHEMA_VERSION ||
		bundle.helpers.htmlEscapeVersion !== 'escape-html-v1' ||
		bundle.helpers.currencyFormatVersion !== 'intl-de-de-eur-v1' ||
		bundle.helpers.tokenInterpolationVersion !== 'interp-v1' ||
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
		}
	>
> = Object.freeze({
	'synthetic-core-v1': {
		usageScope: 'synthetic_test',
		clauseSetVersion: 'synthetic-clause-v1',
		rendererId: 'synthetic-test-pdf-v1',
	},
	'synthetic-withdrawal-v1': {
		usageScope: 'synthetic_test',
		clauseSetVersion: 'synthetic-clause-v1',
		rendererId: 'synthetic-test-pdf-v1',
	},
	[PREVIEW_REVIEW_TEMPLATE_VERSION]: {
		usageScope: 'preview_review',
		clauseSetVersion: PREVIEW_REVIEW_CLAUSE_SET_VERSION,
		rendererId: 'cloudflare-browser-run-pdf-v1',
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

function interpolate(source: string, values: Readonly<Record<string, string>>): string {
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

function renderBundleCss(bundle: ContractTemplateBundle): string {
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

function renderBundleHtml(input: ContractRenderInput, bundle: ContractTemplateBundle): string {
	const copy = bundle.source.kindCopy;
	const schedule = input.service.scheduleLines.length
		? `<ul>${input.service.scheduleLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
		: `<p>${escapeHtml(bundle.source.fixedCopy.scheduleFallback)}</p>`;
	const lineItems = input.billing.lineItems
		.map(
			(item) =>
				`<li><strong>${escapeHtml(item.description)}:</strong> ${escapeHtml(money(item.amountCents))} — ${escapeHtml(item.basis)}</li>`
		)
		.join('');
	const previewReview = bundle.usageScope === 'preview_review';
	const previewPreamble = previewReview
		? `<div class="preview-review-watermark">${escapeHtml(bundle.source.fixedCopy.previewWatermark)}</div>
<div class="preview-review-footer">${escapeHtml(bundle.source.fixedCopy.previewFooter)}</div>
<div class="preview-review-banner">${escapeHtml(bundle.source.fixedCopy.previewBanner)}</div>`
		: '';
	const previewAppendix = previewReview
		? interpolate(bundle.source.previewAppendix, { kindClause: bundle.source.kindClause })
		: '';
	return interpolate(bundle.source.baseBody, {
		title: escapeHtml(copy.title),
		contractNumber: escapeHtml(input.contractNumber),
		css: renderBundleCss(bundle),
		renderSchemaVersion: escapeHtml(bundle.renderSchemaVersion),
		templateId: escapeHtml(bundle.templateId),
		previewPreamble,
		offerNumber: escapeHtml(input.offerNumber),
		effectiveFrom: escapeHtml(input.service.effectiveFrom),
		effectiveTo: input.service.effectiveTo
			? ` bis einschließlich ${escapeHtml(input.service.effectiveTo)}`
			: '',
		providerName: escapeHtml(input.provider.fullName),
		providerAddress: input.provider.addressLines.map(escapeHtml).join('<br>'),
		providerExtra: [input.provider.registrationLines, input.provider.contactLines]
			.flatMap((lines) => lines ?? [])
			.map((line) => `<br>${escapeHtml(line)}`)
			.join(''),
		parentName: escapeHtml(input.parent.fullName),
		parentAddress: input.parent.addressLines.map(escapeHtml).join('<br>'),
		childName: escapeHtml(input.child.fullName),
		serviceTitle: escapeHtml(copy.serviceTitle),
		subject: escapeHtml(input.service.subject),
		schedule,
		billingLead: escapeHtml(copy.billingLead),
		finalPrice: escapeHtml(money(input.billing.finalPriceCents)),
		unitSuffix: input.billing.unitMinutes
			? ` je ${input.billing.unitMinutes} Minuten`
			: ' monatlich',
		paymentTerms: escapeHtml(input.provider.paymentTermsVersion),
		paymentDue: input.billing.paymentDueDay
			? `<br>Fälligkeit spätestens am ${input.billing.paymentDueDay}. des Folgemonats.`
			: '',
		lineItems,
		basePriceDisclaimer: input.billing.basePriceDisclaimer
			? `<p class="notice">${escapeHtml(bundle.source.fixedCopy.basePriceDisclaimer)}</p>`
			: '',
		termLead: escapeHtml(copy.termLead),
		initialTerm: escapeHtml(input.term.initialTermText),
		renewal: escapeHtml(input.term.renewalText),
		ordinaryTermination: escapeHtml(input.term.ordinaryTerminationText),
		extraordinaryTermination: escapeHtml(input.term.extraordinaryTerminationText),
		privacyNotice: escapeHtml(input.legal.privacyNoticeVersion),
		withdrawalText: escapeHtml(input.legal.withdrawalTextVersion),
		distanceLegalProfile: escapeHtml(input.legal.distanceLegalProfile),
		mediaClause: input.legal.mediaClauseVersion
			? `<p>Medienhinweis: ${escapeHtml(input.legal.mediaClauseVersion)}. Eine Entscheidung hierzu ist freiwillig und von der Vertragsannahme getrennt.</p>`
			: '',
		clauseSet: escapeHtml(input.legal.clauseSetVersion),
		attachments: input.legal.attachments.map((item) => `<li>${escapeHtml(item)}</li>`).join(''),
		previewAppendix,
	});
}

export interface RenderedContractSource {
	html: string;
	canonicalInputJson: string;
	renderInputHash: string;
	sourceManifest: {
		renderSchemaVersion: string;
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
	const html = renderBundleHtml(input, bundle);
	const [renderInputHash, sourceHashes, renderedHtmlHash] = await Promise.all([
		hashCanonical(input),
		contractTemplateBundleHashes(bundle),
		sha256Bytes(new TextEncoder().encode(html)),
	]);
	const sourceManifest = {
		renderSchemaVersion: bundle.renderSchemaVersion,
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
