import {
  recallDisplayName,
  type RecallRecord,
} from "@/app/lib/recall/recall";
import { SITE_NAME, SITE_URL, type FaqItem } from "@/app/lib/seo/site";

export function recallPath(numero: string): string {
  return `/recall/${encodeURIComponent(numero)}`;
}

export function recallAbsoluteUrl(numero: string): string {
  return `${SITE_URL}${recallPath(numero)}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Date-only (Postgres `date`) → parse as local calendar day, avoid UTC shift.
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dayOnly) {
    const year = Number(dayOnly[1]);
    const month = Number(dayOnly[2]);
    const day = Number(dayOnly[3]);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Prefer data aggiornamento Ministero, poi acquisizione, poi created_at. */
export function getRecallDateModified(
  recall: RecallRecord
): string | undefined {
  const candidates = [
    recall.other.data_ultimo_aggiornamento,
    recall.data_acquisizione,
    recall.data_ricezione,
    recall.data_pubblicazione,
    recall.created_at,
  ];
  for (const raw of candidates) {
    const date = parseIsoDate(raw);
    if (date) return date.toISOString();
  }
  return undefined;
}

export function formatRecallDateIt(value: string | null | undefined): string | null {
  const date = parseIsoDate(value);
  if (!date) return null;
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function recallDisplayTitle(recall: RecallRecord): string {
  const name = recallDisplayName(recall);
  const title = `${name} — avviso ${recall.numero_riferimento}`;
  // Leave room for layout suffix " | Giuseppe"
  if (title.length > 55) {
    return `${name.slice(0, 40).trimEnd()}… — avviso ${recall.numero_riferimento}`;
  }
  return title;
}

export function getRecallMetaDescription(recall: RecallRecord): string {
  const name = recallDisplayName(recall);
  const maker = recall.fabbricante ? ` di ${recall.fabbricante}` : "";
  const tipo = recall.tipo_dispositivo
    ? ` Tipo: ${recall.tipo_dispositivo}.`
    : "";
  const ricezione = formatRecallDateIt(recall.data_ricezione);
  const dateBit = ricezione ? ` Data di ricezione: ${ricezione}.` : "";
  const azione = recall.other.azione ? ` Azione: ${recall.other.azione}.` : "";

  return `Avviso di sicurezza dispositivi medici n. ${recall.numero_riferimento}: ${name}${maker}.${tipo}${dateBit}${azione} Scheda su ${SITE_NAME}; verifica sempre la fonte ufficiale sul portale del Ministero della Salute.`;
}

export function getRecallFaqItems(recall: RecallRecord): FaqItem[] {
  const name = recallDisplayName(recall);
  const numero = recall.numero_riferimento;
  const ministryUrl = recall.link_pagina?.trim() || null;
  const pdfUrl = recall.link_pdf_allegato?.trim() || null;

  const sourceAnswer = ministryUrl
    ? `La fonte ufficiale è il portale del Ministero della Salute. Apri la pagina originale dall’avviso n. ${numero}${pdfUrl ? " oppure scarica il PDF dell’avviso di sicurezza (FSN) se disponibile" : ""}. ${SITE_NAME} indicizza i dati pubblici ma non sostituisce il Ministero.`
    : `Consulta sempre il portale del Ministero della Salute per gli avvisi di sicurezza sui dispositivi medici. ${SITE_NAME} indicizza i dati pubblici ma non sostituisce la fonte ufficiale.`;

  return [
    {
      question: `Cos’è l’avviso di sicurezza ${numero} su ${name}?`,
      answer: `È un avviso di sicurezza (Field Safety Notice, FSN) reso pubblico dal Ministero della Salute riguardo al dispositivo ${name}${recall.fabbricante ? ` del fabbricante ${recall.fabbricante}` : ""}. Gli FSN comunicano azioni correttive o informazioni di sicurezza ai professionisti e agli utilizzatori.`,
    },
    {
      question: `Cosa fare se uso il dispositivo ${name}?`,
      answer: `Segui le indicazioni dell’avviso ufficiale del Ministero e del fabbricante. Questa pagina su ${SITE_NAME} riassume i dati pubblici (riferimento, fabbricante, date, link) ma non sostituisce le istruzioni operative della fonte ufficiale.`,
    },
    {
      question: `${SITE_NAME} vende o ritira dispositivi medici?`,
      answer: `No. ${SITE_NAME} è un servizio di confronto prezzi per studi dentistici e, in queste pagine, indicizza avvisi pubblici del Ministero della Salute. Non vende dispositivi, non gestisce ritiri e non è un’autorità sanitaria.`,
    },
    {
      question: "Dove trovo la fonte ufficiale di questo avviso?",
      answer: sourceAnswer,
    },
  ];
}

export function getRecallJsonLd(recall: RecallRecord) {
  const url = recallAbsoluteUrl(recall.numero_riferimento);
  const name = recallDisplayName(recall);
  const description = getRecallMetaDescription(recall);
  const faqItems = getRecallFaqItems(recall);
  const dateModified = getRecallDateModified(recall);
  const datePublished =
    parseIsoDate(recall.data_pubblicazione || recall.data_ricezione)?.toISOString() ??
    undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: recallDisplayTitle(recall),
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
        about: {
          "@type": "MedicalDevice",
          name,
          ...(recall.fabbricante
            ? {
                manufacturer: {
                  "@type": "Organization",
                  name: recall.fabbricante,
                },
              }
            : {}),
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
            name: "Avvisi di sicurezza",
          },
          {
            "@type": "ListItem",
            position: 3,
            name,
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
