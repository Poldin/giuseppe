import {
  medicalDeviceDisplayName,
  type MedicalDeviceRecord,
} from "@/app/lib/medical-device/device";
import { SITE_NAME, SITE_URL, type FaqItem } from "@/app/lib/seo/site";

export function medicalDevicePath(slug: string): string {
  return `/medical_device/${encodeURIComponent(slug)}`;
}

export function medicalDeviceAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${medicalDevicePath(slug)}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
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

export function getMedicalDeviceDateModified(
  device: MedicalDeviceRecord
): string | undefined {
  const candidates = [
    device.updated_at,
    device.data_inizio_validita,
    device.data_prima_pubblicazione,
    device.created_at,
  ];
  for (const raw of candidates) {
    const date = parseIsoDate(raw);
    if (date) return date.toISOString();
  }
  return undefined;
}

export function formatMedicalDeviceDateIt(
  value: string | null | undefined
): string | null {
  const date = parseIsoDate(value);
  if (!date) return null;
  // Nascondi sentinel Ministero 31/12/9999
  if (date.getFullYear() >= 9999) return null;
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function medicalDeviceDisplayTitle(device: MedicalDeviceRecord): string {
  const name = medicalDeviceDisplayName(device);
  const prog = device.progressivo_dm_ass;
  const title = `${name} — repertorio ${prog}`;
  if (title.length > 55) {
    return `${name.slice(0, 36).trimEnd()}… — repertorio ${prog}`;
  }
  return title;
}

export function getMedicalDeviceMetaDescription(
  device: MedicalDeviceRecord
): string {
  const name = medicalDeviceDisplayName(device);
  const maker = device.fabbricante_assemblatore
    ? ` Fabbricante: ${device.fabbricante_assemblatore}.`
    : "";
  const cnd = device.classificazione_cnd
    ? ` CND ${device.classificazione_cnd}${
        device.descrizione_cnd ? ` (${device.descrizione_cnd})` : ""
      }.`
    : "";
  const catalog = device.cod_catalogo_fabbr_ass
    ? ` Codice catalogo: ${device.cod_catalogo_fabbr_ass}.`
    : "";
  const repertorio =
    device.iscrizione_repertorio === "S"
      ? " Iscritto al Repertorio dei dispositivi medici."
      : device.iscrizione_repertorio === "N"
        ? " Non iscritto al Repertorio."
        : "";

  return `Scheda dispositivo medico ${name} (progressivo ${device.progressivo_dm_ass}).${maker}${cnd}${catalog}${repertorio} Dati pubblici del Ministero della Salute su ${SITE_NAME}.`;
}

export function getMedicalDeviceFaqItems(
  device: MedicalDeviceRecord
): FaqItem[] {
  const name = medicalDeviceDisplayName(device);
  const prog = device.progressivo_dm_ass;
  const maker = device.fabbricante_assemblatore;

  return [
    {
      question: `Cos’è il dispositivo ${name} (repertorio ${prog})?`,
      answer: `${name} è un dispositivo medico presente nella banca dati / Repertorio del Ministero della Salute con progressivo ${prog}.${
        maker ? ` Fabbricante/assemblatore indicato: ${maker}.` : ""
      }${
        device.descrizione_cnd
          ? ` Classificazione CND: ${device.classificazione_cnd ?? "n/d"} — ${device.descrizione_cnd}.`
          : ""
      }`,
    },
    {
      question: `Cosa significa il progressivo Repertorio ${prog}?`,
      answer: `È l’identificativo attribuito al dispositivo nella banca dati dei dispositivi medici del Ministero della Salute. Su ${SITE_NAME} lo usiamo per collegare in modo stabile i dati pubblici di questa scheda.`,
    },
    {
      question: `${SITE_NAME} vende questo dispositivo medico?`,
      answer: `No. ${SITE_NAME} è un servizio di confronto prezzi per studi dentistici e, in queste pagine, indicizza schede pubbliche del Repertorio. Non vende dispositivi e non sostituisce la fonte ufficiale del Ministero della Salute.`,
    },
    {
      question: "Dove trovo la fonte ufficiale di questi dati?",
      answer: `I dati provengono dagli open data del Ministero della Salute (banca dati e Repertorio dei dispositivi medici / variazioni settimanali). Verifica sempre sul portale ufficiale del Ministero per lo stato aggiornato dell’iscrizione e della commercializzazione.`,
    },
  ];
}

export function getMedicalDeviceJsonLd(device: MedicalDeviceRecord) {
  const url = medicalDeviceAbsoluteUrl(device.slug);
  const name = medicalDeviceDisplayName(device);
  const description = getMedicalDeviceMetaDescription(device);
  const faqItems = getMedicalDeviceFaqItems(device);
  const dateModified = getMedicalDeviceDateModified(device);
  const datePublished =
    parseIsoDate(device.data_prima_pubblicazione)?.toISOString() ?? undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: medicalDeviceDisplayTitle(device),
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
        about: {
          "@type": "MedicalDevice",
          name,
          ...(device.progressivo_dm_ass
            ? { identifier: device.progressivo_dm_ass }
            : {}),
          ...(device.classificazione_cnd
            ? {
                category: device.descrizione_cnd
                  ? `${device.classificazione_cnd} — ${device.descrizione_cnd}`
                  : device.classificazione_cnd,
              }
            : {}),
          ...(device.fabbricante_assemblatore
            ? {
                manufacturer: {
                  "@type": "Organization",
                  name: device.fabbricante_assemblatore,
                  ...(device.partita_iva_vat || device.cod_fiscale
                    ? {
                        identifier:
                          device.partita_iva_vat || device.cod_fiscale || undefined,
                      }
                    : {}),
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
            name: "Dispositivi medici",
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
