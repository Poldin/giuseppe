import {
  getAllTeeth,
  palmerNotation,
  type ToothRecord,
} from "@/app/lib/notazione-dentale/teeth";
import { SITE_NAME, SITE_URL, type FaqItem } from "@/app/lib/seo/site";

export function notazioneDentaleHubPath(): string {
  return "/notazione-dentale";
}

export function notazioneDentalePath(slug: string): string {
  return `/notazione-dentale/${encodeURIComponent(slug)}`;
}

export function notazioneDentaleAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${notazioneDentalePath(slug)}`;
}

export function notazioneDentaleHubAbsoluteUrl(): string {
  return `${SITE_URL}${notazioneDentaleHubPath()}`;
}

export function toothDisplayTitle(tooth: ToothRecord): string {
  const title = `${tooth.nome_anatomico} (FDI ${tooth.fdi})`;
  if (title.length > 55) {
    return `${tooth.nome_anatomico.slice(0, 40).trimEnd()}… (FDI ${tooth.fdi})`;
  }
  return title;
}

export function getToothMetaDescription(tooth: ToothRecord): string {
  const giudizio = tooth.is_dente_giudizio
    ? " È un dente del giudizio (terzo molare)."
    : "";
  return `${tooth.nome_anatomico}: notazione FDI ${tooth.fdi}, Universal ${tooth.universal}, Palmer ${palmerNotation(tooth)}. Quadrante ${tooth.quadrante_nome}.${giudizio} Conversione tra sistemi di numerazione dentale su ${SITE_NAME}.`;
}

export function getToothIntro(tooth: ToothRecord): string {
  const giudizio = tooth.is_dente_giudizio
    ? " Si tratta di un dente del giudizio (terzo molare)."
    : "";
  return `Il ${tooth.nome_anatomico.toLowerCase()} appartiene al quadrante ${tooth.quadrante_nome.toLowerCase()}. Nei sistemi internazionali corrisponde a FDI ${tooth.fdi}, Universal (ADA) ${tooth.universal} e Palmer ${palmerNotation(tooth)}.${giudizio}`;
}

export function getToothFaqItems(tooth: ToothRecord): FaqItem[] {
  const palmer = palmerNotation(tooth);
  return [
    {
      question: `Qual è il codice FDI del ${tooth.nome_anatomico.toLowerCase()}?`,
      answer: `Nel sistema FDI (ISO 3950) questo dente è indicato come ${tooth.fdi}. Il primo digit identifica il quadrante (${tooth.quadrante_id} — ${tooth.quadrante_nome}), il secondo la posizione da 1 (incisivo centrale) a 8 (terzo molare).`,
    },
    {
      question: `A quale numero Universal corrisponde il dente FDI ${tooth.fdi}?`,
      answer: `Nel sistema Universal (ADA), usato soprattutto negli Stati Uniti, il dente FDI ${tooth.fdi} corrisponde al numero ${tooth.universal}.`,
    },
    {
      question: `Come si scrive in notazione Palmer?`,
      answer: `In Palmer si usa il simbolo di quadrante e il numero da 1 a 8: per questo dente la notazione è ${palmer} (simbolo ${tooth.palmer_simbolo}, numero ${tooth.palmer_numero}).`,
    },
  ];
}

export function getToothJsonLd(tooth: ToothRecord) {
  const url = notazioneDentaleAbsoluteUrl(tooth.slug);
  const hubUrl = notazioneDentaleHubAbsoluteUrl();
  const description = getToothMetaDescription(tooth);
  const faqItems = getToothFaqItems(tooth);
  const title = toothDisplayTitle(tooth);

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
        about: {
          "@type": "DefinedTerm",
          name: tooth.nome_anatomico,
          description,
          termCode: tooth.fdi,
          inDefinedTermSet: {
            "@type": "DefinedTermSet",
            name: "Notazione dentale FDI (ISO 3950)",
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
            name: "Notazione dentale",
            item: hubUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: tooth.nome_anatomico,
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

export const NOTAZIONE_DENTALE_HUB_TITLE =
  "Notazione dentale FDI, Universal e Palmer";

export function getNotazioneDentaleHubDescription(): string {
  return `Guida alla notazione dentale permanente: converti i 32 denti tra sistema FDI (ISO 3950), Universal (ADA) e Palmer. Schede per quadrante su ${SITE_NAME}.`;
}

export function getNotazioneDentaleHubJsonLd() {
  const url = notazioneDentaleHubAbsoluteUrl();
  const description = getNotazioneDentaleHubDescription();
  const teeth = getAllTeeth();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: NOTAZIONE_DENTALE_HUB_TITLE,
        description,
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
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
            name: "Notazione dentale",
            item: url,
          },
        ],
      },
      {
        "@type": "ItemList",
        "@id": `${url}#itemlist`,
        name: "Denti permanenti — conversione notazioni",
        numberOfItems: teeth.length,
        itemListElement: teeth.map((tooth, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: tooth.nome_anatomico,
          url: notazioneDentaleAbsoluteUrl(tooth.slug),
        })),
      },
    ],
  };
}

/** Static sitemap entries (hub + 32 teeth) — no DB. */
export function getNotazioneDentaleSitemapEntries(): {
  url: string;
  changeFrequency: "yearly";
  priority: number;
}[] {
  const hub = {
    url: notazioneDentaleHubAbsoluteUrl(),
    changeFrequency: "yearly" as const,
    priority: 0.6,
  };
  const teeth = getAllTeeth().map((tooth) => ({
    url: notazioneDentaleAbsoluteUrl(tooth.slug),
    changeFrequency: "yearly" as const,
    priority: 0.45,
  }));
  return [hub, ...teeth];
}
