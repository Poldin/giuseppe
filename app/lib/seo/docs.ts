import type { ManufacturerDocument } from "@/app/lib/docs/document";
import { SITE_NAME, SITE_URL, type FaqItem } from "@/app/lib/seo/site";

/** Etichette IT leggibili per SEO / UI. */
export const ASSET_TYPE_LABELS: Record<string, string> = {
  ifu: "Istruzioni per l'uso (IFU)",
  sds: "Scheda di sicurezza (SDS)",
  declaration_of_conformity: "Dichiarazione di conformità",
  ce_certificate: "Certificato CE",
  qms_certificate: "Certificato SGQ / QMS",
  label: "Etichetta",
  glossary: "Glossario",
  processing_guide: "Guida alla lavorazione",
  technique_guide: "Guida tecnica",
  quick_reference: "Guida di riferimento rapido",
  cadcam_library: "Libreria CAD/CAM",
  brochure: "Opuscolo",
  flyer: "Volantino",
  recycling_pass: "Passaggio per il riciclo",
  care: "Piano di cura e pulizia",
  installation_requirements: "Requisiti di installazione",
  sscp: "SSCP",
  terms: "Termini e condizioni",
  scientific_ce: "Documento scientifico / CE",
  scientific_manual: "Manuale scientifico",
  other: "Documento tecnico",
};

/** Forma corta per title SEO (es. "SDS", "IFU"). */
export const ASSET_TYPE_SHORT: Record<string, string> = {
  ifu: "IFU",
  sds: "SDS",
  declaration_of_conformity: "DoC",
  ce_certificate: "Certificato CE",
  qms_certificate: "Certificato QMS",
  label: "Etichetta",
  glossary: "Glossario",
  processing_guide: "Processing guide",
  technique_guide: "Guida tecnica",
  quick_reference: "Quick reference",
  cadcam_library: "CAD/CAM",
  brochure: "Opuscolo",
  flyer: "Volantino",
  recycling_pass: "Recycling pass",
  care: "CARE",
  installation_requirements: "Installazione",
  sscp: "SSCP",
  terms: "Termini",
  scientific_ce: "Scientifico",
  scientific_manual: "Manuale",
  other: "Documento",
};

export function docsPath(slug: string): string {
  return `/docs/${encodeURIComponent(slug)}`;
}

export function docsAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${docsPath(slug)}`;
}

export function docsSearchPath(query?: string): string {
  if (!query?.trim()) return "/docs/search";
  return `/docs/search?q=${encodeURIComponent(query.trim())}`;
}

export function assetTypeLabel(assetType: string): string {
  return ASSET_TYPE_LABELS[assetType] ?? ASSET_TYPE_LABELS.other;
}

export function assetTypeShort(assetType: string): string {
  return ASSET_TYPE_SHORT[assetType] ?? ASSET_TYPE_SHORT.other;
}

export function manufacturerName(doc: ManufacturerDocument): string {
  return doc.source?.name?.trim() || "Fabbricante";
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getDocDateModified(doc: ManufacturerDocument): string | undefined {
  for (const raw of [doc.updated_at, doc.last_seen_at, doc.created_at]) {
    const date = parseIsoDate(raw);
    if (date) return date.toISOString();
  }
  return undefined;
}

export function formatDocDateIt(value: string | null | undefined): string | null {
  const date = parseIsoDate(value);
  if (!date) return null;
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Title SEO: tipodoc + manufacturer + titolo documento + “download”.
 * Es. "SDS Dentsply Sirona — Calibra Universal | download"
 */
export function docDisplayTitle(doc: ManufacturerDocument): string {
  const short = assetTypeShort(doc.asset_type);
  const maker = manufacturerName(doc);
  const core = `${short} ${maker} — ${doc.title}`;
  const withDownload = `${core} | download`;
  // Leave room for layout suffix " | Giuseppe"
  if (withDownload.length <= 58) return withDownload;
  if (core.length <= 58) return core;
  const budget = 50 - `${short} ${maker} — `.length;
  const sliced =
    budget > 12 ? `${doc.title.slice(0, budget).trimEnd()}…` : doc.title.slice(0, 40);
  return `${short} ${maker} — ${sliced}`;
}

export function getDocMetaDescription(doc: ManufacturerDocument): string {
  const label = assetTypeLabel(doc.asset_type);
  const maker = manufacturerName(doc);
  const inactive = doc.is_active
    ? ""
    : " Attenzione: l’asset potrebbe non essere più disponibile sul sito del fabbricante.";
  const desc = doc.description?.trim()
    ? ` ${doc.description.trim().slice(0, 120)}`
    : "";

  return `${label} di ${maker}: ${doc.title}.${desc} Scarica il PDF su ${SITE_NAME}.${inactive} Verifica sempre la versione ufficiale sul sito del fabbricante.`;
}

export function getDocFaqItems(doc: ManufacturerDocument): FaqItem[] {
  const label = assetTypeLabel(doc.asset_type);
  const maker = manufacturerName(doc);
  const short = assetTypeShort(doc.asset_type);

  return [
    {
      question: `Cos’è questo ${short} di ${maker}?`,
      answer: `Questa pagina di ${SITE_NAME} indica il documento «${doc.title}» (${label}) pubblicato da ${maker}. Puoi scaricare il PDF dal link diretto al file del fabbricante.`,
    },
    {
      question: `Dove scarico la scheda / il PDF originale?`,
      answer: `Il pulsante «Scarica PDF» apre il file sul sito di ${maker}${doc.source?.domain ? ` (${doc.source.domain})` : ""}. ${SITE_NAME} non ospita una copia del documento: punta al download ufficiale.`,
    },
    {
      question: `Questa è la fonte ufficiale di ${maker}?`,
      answer: `No. ${SITE_NAME} indicizza i link pubblici ai documenti tecnici (SDS, IFU, certificati, ecc.) per aiutarne il ritrovamento. La fonte ufficiale resta sempre il fabbricante e il suo Download Center.`,
    },
    {
      question: `Il documento è ancora valido?`,
      answer: doc.is_active
        ? `Al momento dell’ultimo controllo risultava presente nel catalogo documenti di ${maker}. Controlla comunque data e versione sul PDF ufficiale prima dell’uso in studio.`
        : `L’asset potrebbe non essere più disponibile sul sito del fabbricante (modifica o rimozione dal catalogo ufficiale). Verifica sul Download Center di ${maker} o contatta il supporto del produttore.`,
    },
  ];
}

export function getDocJsonLd(doc: ManufacturerDocument) {
  const url = docsAbsoluteUrl(doc.slug);
  const title = docDisplayTitle(doc);
  const description = getDocMetaDescription(doc);
  const faqItems = getDocFaqItems(doc);
  const dateModified = getDocDateModified(doc);
  const maker = manufacturerName(doc);
  const label = assetTypeLabel(doc.asset_type);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        ...(dateModified ? { dateModified } : {}),
        about: {
          "@type": "DigitalDocument",
          name: doc.title,
          encodingFormat: "application/pdf",
          url: doc.file_url,
          category: label,
          ...(doc.is_active ? {} : { creativeWorkStatus: "Unavailable" }),
          author: {
            "@type": "Organization",
            name: maker,
            ...(doc.source?.domain
              ? { url: `https://${doc.source.domain}` }
              : {}),
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Documenti tecnici",
            item: `${SITE_URL}/docs/search`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: doc.title,
            item: url,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
