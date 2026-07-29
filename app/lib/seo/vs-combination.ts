import {
  formatVsPrice,
  vsCombinationDisplayTitle,
  vsShopNamesLabel,
  type VsCombination,
  type VsSide,
} from "@/app/lib/vs/combination";
import {
  getPriceTransparency,
  SITE_NAME,
  SITE_URL,
  type FaqItem,
} from "@/app/lib/seo/site";

export function vsHubPath(query?: string): string {
  if (!query?.trim()) return "/vs";
  return `/vs?q=${encodeURIComponent(query.trim())}`;
}

export function vsHubAbsoluteUrl(): string {
  return `${SITE_URL}${vsHubPath()}`;
}

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

/** Canonical pubblico: le pair puntano al cluster quando disponibile. */
export function getVsCombinationCanonicalPath(combo: VsCombination): string {
  if (combo.kind === "pair" && combo.cluster_slug) {
    return vsCombinationPath(combo.cluster_slug);
  }
  return vsCombinationPath(combo.slug);
}

export function getVsCombinationMetaDescription(combo: VsCombination): string {
  const name = combo.canonical_name;
  const shops = vsShopNamesLabel(combo);
  const diff = formatVsPrice(combo.price_diff);
  const n = combo.sides.length;

  if (diff && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0) {
    if (n > 2) {
      return `Miglior prezzo di ${name} tra ${n} shop (${shops}): su ${combo.cheaper_shop_name} risparmi fino a ${diff}. Confronto offerte per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
    }
    return `Miglior prezzo di ${name} tra ${shops}: su ${combo.cheaper_shop_name} risparmi ${diff}. Confronto offerte per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
  }

  return `Miglior prezzo e confronto di ${name}: ${shops}. Confronta offerte per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
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
  const diff = formatVsPrice(combo.price_diff);
  const priced = combo.sides.filter(
    (s) => !s.is_escluded && s.final_price != null
  );
  const bestSide =
    priced.find((s) => s.rank === 1) ??
    [...priced].sort(
      (a, b) => Number(a.final_price) - Number(b.final_price)
    )[0];
  const bestPrice = bestSide ? formatVsPrice(bestSide.final_price) : null;

  const bestShopName =
    combo.cheaper_shop_name ?? bestSide?.ecommerce.name ?? null;

  const cheaperAnswer =
    diff && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0
      ? `Secondo il catalogo di ${SITE_NAME}, ${name} conviene di più su ${combo.cheaper_shop_name}: differenza fino a ${diff} rispetto alle altre offerte (${priced.map(sidePriceLabel).join("; ")}). I prezzi sono di catalogo; verifica sempre sul sito del rivenditore.`
      : `Per ${name} confrontiamo ${vsShopNamesLabel(combo)}: ${combo.sides.map(sidePriceLabel).join("; ")}. Verifica sempre prezzo e disponibilità sul sito del rivenditore.`;

  const bestPriceAnswer =
    bestPrice && bestShopName
      ? `Tra gli shop confrontati su ${SITE_NAME}, il miglior prezzo di catalogo per ${name} è ${bestPrice} su ${bestShopName}. Non è un prezzo assoluto di mercato: confrontiamo solo i rivenditori indicati in pagina. Verifica sempre prezzo finale e IVA sul sito del rivenditore.`
      : `Per ${name} confrontiamo ${vsShopNamesLabel(combo)}: ${combo.sides.map(sidePriceLabel).join("; ")}. Il miglior prezzo tra quelli disponibili va verificato sul sito del rivenditore (prezzo finale e IVA).`;

  const pricesQuestion =
    combo.sides.length > 2
      ? `Quali sono i prezzi di ${name} sui diversi shop?`
      : `Qual è il prezzo di ${name} su ${combo.sides[0]?.ecommerce.name ?? "shop A"} e ${combo.sides[1]?.ecommerce.name ?? "shop B"}?`;

  return [
    {
      question: `Qual è il miglior prezzo di ${name}?`,
      answer: bestPriceAnswer,
    },
    {
      question: `Dove costa meno ${name}?`,
      answer: cheaperAnswer,
    },
    {
      question: pricesQuestion,
      answer: `${combo.sides.map(sidePriceLabel).join(". ")}. ${SITE_NAME} confronta i cataloghi ma non vende i prodotti.`,
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
  const canonicalUrl =
    combo.kind === "pair" && combo.cluster_slug
      ? vsCombinationAbsoluteUrl(combo.cluster_slug)
      : url;
  const faqItems = getVsCombinationFaqItems(combo, now);
  const dateModified = getVsCombinationDateModified(combo);
  const offers = combo.sides
    .map((side) => offerForSide(side, url))
    .filter(Boolean);

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
        ...(canonicalUrl !== url ? { mainEntityOfPage: canonicalUrl } : {}),
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
        name: `Miglior prezzo — confronto ${vsShopNamesLabel(combo)}`,
        numberOfItems: combo.sides.length,
        itemListElement: combo.sides.map((side, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: `${side.product_name} su ${side.ecommerce.name}`,
          url: side.original_url ?? url,
        })),
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
            name: "Confronti prezzi",
            item: vsHubAbsoluteUrl(),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: combo.canonical_name,
            item: canonicalUrl,
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
