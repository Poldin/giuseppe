import { formatPubPrice } from "@/app/lib/pub/product";
import type { TypeLander } from "@/app/lib/category/type-lander";
import {
  getPriceTransparency,
  SITE_NAME,
  SITE_URL,
  type FaqItem,
} from "@/app/lib/seo/site";

export function typeLanderPath(slug: string): string {
  return `/categorie/${encodeURIComponent(slug)}`;
}

export function typeLanderHubPath(query?: string): string {
  if (!query?.trim()) return "/categorie";
  return `/categorie?q=${encodeURIComponent(query.trim())}`;
}

export function typeLanderAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${typeLanderPath(slug)}`;
}

export function typeLanderHubAbsoluteUrl(): string {
  return `${SITE_URL}${typeLanderHubPath()}`;
}

export function typeLanderDisplayTitle(lander: TypeLander): string {
  const count = lander.product_count.toLocaleString("it-IT");
  const avg = formatPubPrice(lander.avg_price);
  if (avg) {
    return `${lander.seo_title} — ${count} prodotti, media ${avg}`;
  }
  return `${lander.seo_title} — ${count} prodotti`;
}

export function getTypeLanderMetaDescription(lander: TypeLander): string {
  const count = lander.product_count.toLocaleString("it-IT");
  const avg = formatPubPrice(lander.avg_price);
  const min = formatPubPrice(lander.min_price);
  const max = formatPubPrice(lander.max_price);
  const range =
    min && max && min !== max
      ? ` Prezzi indicativi da ${min} a ${max}.`
      : avg
        ? ` Prezzo medio indicativo ${avg}.`
        : "";

  return `Confronta ${count} ${lander.seo_title.toLowerCase()} su ${SITE_NAME}.${range} Catalogo aggiornato quotidianamente; il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
}

export function getTypeLanderFaqItems(
  lander: TypeLander,
  now = new Date()
): FaqItem[] {
  const title = lander.seo_title;
  const count = lander.product_count.toLocaleString("it-IT");
  const avg = formatPubPrice(lander.avg_price);
  const min = formatPubPrice(lander.min_price);
  const max = formatPubPrice(lander.max_price);

  const priceAnswer = avg
    ? `Su ${SITE_NAME} trovi ${count} referenze di ${title.toLowerCase()}. Il prezzo medio di catalogo è ${avg}${
        min && max ? ` (indicativamente da ${min} a ${max})` : ""
      }. I prezzi sono di catalogo e si aggiornano quotidianamente: il prezzo finale e l’IVA vanno sempre verificati sul sito del rivenditore.`
    : `Su ${SITE_NAME} trovi ${count} referenze di ${title.toLowerCase()}. Verifica disponibilità e prezzo aggiornato sul sito del rivenditore.`;

  return [
    {
      question: `Quante offerte di ${title.toLowerCase()} confronta ${SITE_NAME}?`,
      answer: `Al momento ${SITE_NAME} aggrega ${count} prodotti classificati come ${title.toLowerCase()} nei cataloghi degli ecommerce dentali confrontati.`,
    },
    {
      question: `Qual è il prezzo medio di ${title.toLowerCase()}?`,
      answer: priceAnswer,
    },
    {
      question: "I prezzi sono aggiornati? Includono l’IVA?",
      answer: getPriceTransparency(now),
    },
    {
      question: `${SITE_NAME} vende i prodotti?`,
      answer: `No: ${SITE_NAME} confronta le offerte e ti porta ai rivenditori; non vende e non gestisce il pagamento.`,
    },
  ];
}

export function getTypeLanderJsonLd(lander: TypeLander, now = new Date()) {
  const url = typeLanderAbsoluteUrl(lander.slug);
  const displayName = typeLanderDisplayTitle(lander);
  const faqItems = getTypeLanderFaqItems(lander, now);
  const avg = lander.avg_price;
  const low = lander.min_price;
  const high = lander.max_price;

  const aggregateOffer =
    avg != null || (low != null && high != null)
      ? {
          "@type": "AggregateOffer" as const,
          priceCurrency: "EUR",
          ...(avg != null ? { price: Number(avg).toFixed(2) } : {}),
          ...(low != null ? { lowPrice: Number(low).toFixed(2) } : {}),
          ...(high != null ? { highPrice: Number(high).toFixed(2) } : {}),
          offerCount: lander.priced_count,
        }
      : null;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#page`,
        url,
        name: displayName,
        headline: displayName,
        description: getTypeLanderMetaDescription(lander),
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: {
          "@type": "Thing",
          name: lander.seo_title,
        },
        mainEntity: {
          "@type": "ItemList",
          name: displayName,
          numberOfItems: lander.product_count,
          itemListElement: lander.sample_products.map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${SITE_URL}/pub/${encodeURIComponent(product.pub_slug)}`,
            name: product.product_name,
            ...(product.final_price != null
              ? {
                  offers: {
                    "@type": "Offer",
                    priceCurrency: "EUR",
                    price: Number(product.final_price).toFixed(2),
                  },
                }
              : {}),
          })),
        },
        ...(aggregateOffer ? { offers: aggregateOffer } : {}),
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
