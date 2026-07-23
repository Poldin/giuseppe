import {
  formatVsPrice,
  vsCombinationDisplayTitle,
  type VsCombination,
  type VsSide,
} from "@/app/lib/vs/combination";
import {
  getPriceTransparency,
  SITE_NAME,
  SITE_URL,
  type FaqItem,
} from "@/app/lib/seo/site";

export function vsCombinationPath(slug: string): string {
  return `/vs/${encodeURIComponent(slug)}`;
}

export function vsCombinationAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${vsCombinationPath(slug)}`;
}

export function getVsCombinationDateModified(
  combo: VsCombination
): string | undefined {
  if (!combo.created_at) return undefined;
  const date = new Date(combo.created_at);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function getVsCombinationMetaDescription(combo: VsCombination): string {
  const a = combo.side_a.ecommerce.name;
  const b = combo.side_b.ecommerce.name;
  const name = combo.canonical_name;
  const diff = formatVsPrice(combo.price_diff);

  if (diff && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0) {
    return `Confronto prezzi ${name}: ${a} vs ${b}. Su ${combo.cheaper_shop_name} risparmi ${diff}. Confronta offerte per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
  }

  return `Confronto prezzi ${name}: ${a} vs ${b}. Confronta offerte per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
}

function sidePriceLabel(side: VsSide): string {
  if (side.is_escluded) {
    return `potrebbe non essere disponibile su ${side.ecommerce.name}`;
  }
  const price = formatVsPrice(side.final_price);
  return price
    ? `${price} su ${side.ecommerce.name}`
    : `prezzo non disponibile su ${side.ecommerce.name}`;
}

export function getVsCombinationFaqItems(
  combo: VsCombination,
  now = new Date()
): FaqItem[] {
  const name = combo.canonical_name;
  const a = combo.side_a;
  const b = combo.side_b;
  const diff = formatVsPrice(combo.price_diff);

  const cheaperAnswer =
    diff && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0
      ? `Secondo il catalogo di ${SITE_NAME}, ${name} conviene di più su ${combo.cheaper_shop_name}: differenza di ${diff} rispetto all’altra offerta (${sidePriceLabel(a)}; ${sidePriceLabel(b)}). I prezzi sono di catalogo; verifica sempre sul sito del rivenditore.`
      : `Per ${name} confrontiamo ${a.ecommerce.name} e ${b.ecommerce.name}: ${sidePriceLabel(a)}; ${sidePriceLabel(b)}. Verifica sempre prezzo e disponibilità sul sito del rivenditore.`;

  return [
    {
      question: `Dove costa meno ${name}?`,
      answer: cheaperAnswer,
    },
    {
      question: `Qual è il prezzo di ${name} su ${a.ecommerce.name} e ${b.ecommerce.name}?`,
      answer: `${sidePriceLabel(a)}. ${sidePriceLabel(b)}. ${SITE_NAME} confronta i cataloghi ma non vende i prodotti.`,
    },
    {
      question: "I prezzi sono aggiornati? Includono l’IVA?",
      answer: getPriceTransparency(now),
    },
  ];
}

function offerForSide(side: VsSide, pageUrl: string) {
  const offerUrl = side.original_url ?? pageUrl;
  if (side.is_escluded) {
    return {
      "@type": "Offer" as const,
      url: offerUrl,
      availability: "https://schema.org/Discontinued",
      seller: {
        "@type": "Organization" as const,
        name: side.ecommerce.name,
      },
    };
  }
  if (side.final_price == null) return undefined;
  return {
    "@type": "Offer" as const,
    url: offerUrl,
    priceCurrency: "EUR",
    price: Number(side.final_price).toFixed(2),
    availability: "https://schema.org/InStock",
    seller: {
      "@type": "Organization" as const,
      name: side.ecommerce.name,
    },
  };
}

export function getVsCombinationJsonLd(combo: VsCombination, now = new Date()) {
  const url = vsCombinationAbsoluteUrl(combo.slug);
  const faqItems = getVsCombinationFaqItems(combo, now);
  const dateModified = getVsCombinationDateModified(combo);
  const offers = [offerForSide(combo.side_a, url), offerForSide(combo.side_b, url)].filter(
    Boolean
  );

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: vsCombinationDisplayTitle(combo),
        description: getVsCombinationMetaDescription(combo),
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${url}#product` },
        ...(dateModified ? { dateModified } : {}),
      },
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: combo.canonical_name,
        description: getVsCombinationMetaDescription(combo),
        offers: offers.length > 0 ? offers : undefined,
        ...(dateModified ? { dateModified } : {}),
      },
      {
        "@type": "ItemList",
        "@id": `${url}#offers`,
        name: `Confronto ${combo.side_a.ecommerce.name} vs ${combo.side_b.ecommerce.name}`,
        numberOfItems: 2,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: `${combo.side_a.product_name} su ${combo.side_a.ecommerce.name}`,
            url: combo.side_a.original_url ?? url,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: `${combo.side_b.product_name} su ${combo.side_b.ecommerce.name}`,
            url: combo.side_b.original_url ?? url,
          },
        ],
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
            name: combo.canonical_name,
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
