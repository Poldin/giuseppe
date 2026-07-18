import {
  formatPubPrice,
  pubProductDisplayTitle,
  type PubProduct,
} from "@/app/lib/pub/product";
import {
  getPriceTransparency,
  SITE_NAME,
  SITE_URL,
  type FaqItem,
} from "@/app/lib/seo/site";

export function pubProductPath(slug: string): string {
  return `/pub/${encodeURIComponent(slug)}`;
}

export function pubProductAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${pubProductPath(slug)}`;
}

/** ISO-8601 da `update_at` catalogo; null se assente o non valido. */
export function getPubProductDateModified(
  product: PubProduct
): string | undefined {
  if (!product.update_at) return undefined;
  const date = new Date(product.update_at);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function getPubProductMetaDescription(product: PubProduct): string {
  const shop = product.ecommerce?.name ?? "ecommerce dentale";
  const name = `${product.product_name}${product.brand ? ` di ${product.brand}` : ""}`;

  if (product.is_escluded) {
    return `${name} su ${shop}. Questo prodotto potrebbe essere escluso dalla vendita: verifica sul sito del rivenditore. Confronta prezzi e prodotti per studi dentistici con ${SITE_NAME}.`;
  }

  const price = formatPubPrice(product.final_price);
  return `${name}, disponibile su ${shop}${price ? ` a ${price}` : ""}. Confronta prezzi e prodotti per studi dentistici con ${SITE_NAME}. Il prezzo finale e l’IVA vanno verificati sul sito del rivenditore.`;
}

/**
 * FAQ prodotto — stesso testo in UI e JSON-LD FAQPage.
 * Allineata a query tipo “Qual è il prezzo attuale del Gerhò [prodotto]?”.
 */
export function getPubProductFaqItems(
  product: PubProduct,
  now = new Date()
): FaqItem[] {
  const name = product.product_name;
  const shop = product.ecommerce?.name?.trim() || "ecommerce dentale";
  const price = !product.is_escluded
    ? formatPubPrice(product.final_price)
    : null;
  const hasProductUrl = Boolean(product.original_url?.trim());

  const priceAnswer = product.is_escluded
    ? `Al momento ${name} potrebbe essere escluso dalla vendita su ${shop}. Verifica disponibilità e prezzo direttamente sul sito del rivenditore. ${SITE_NAME} confronta i cataloghi ma non vende i prodotti.`
    : price
      ? `Il prezzo indicato da ${SITE_NAME} per ${name} su ${shop} è ${price}. Si tratta di un prezzo di catalogo aggiornato quotidianamente: il prezzo finale e l’IVA vanno sempre verificati sul sito del rivenditore al momento dell’acquisto.`
      : `Il prezzo di ${name} su ${shop} non è disponibile al momento su ${SITE_NAME}. Verifica il prezzo aggiornato direttamente sul sito del rivenditore.`;

  const buyAnswer = hasProductUrl
    ? `Puoi acquistare ${name} direttamente su ${shop} tramite il link “Vedi su ${shop}” in questa pagina. ${SITE_NAME} non gestisce pagamento né spedizione: l’acquisto avviene sul sito del rivenditore.`
    : `Puoi acquistare ${name} sul sito di ${shop}. ${SITE_NAME} non gestisce pagamento né spedizione: l’acquisto avviene direttamente presso il rivenditore.`;

  return [
    {
      question: `Qual è il prezzo attuale di ${name} su ${shop}?`,
      answer: priceAnswer,
    },
    {
      question: `Dove posso comprare ${name}?`,
      answer: buyAnswer,
    },
    {
      question: "I prezzi sono aggiornati? Includono l’IVA?",
      answer: getPriceTransparency(now),
    },
  ];
}

export function getPubProductJsonLd(product: PubProduct, now = new Date()) {
  const url = pubProductAbsoluteUrl(product.pub_slug);
  const price = product.is_escluded ? null : product.final_price;
  const shopName = product.ecommerce?.name ?? undefined;
  const offerUrl = product.original_url ?? url;
  const faqItems = getPubProductFaqItems(product, now);
  const dateModified = getPubProductDateModified(product);

  const offer = product.is_escluded
    ? {
        "@type": "Offer" as const,
        url: offerUrl,
        availability: "https://schema.org/Discontinued",
        seller: shopName
          ? {
              "@type": "Organization" as const,
              name: shopName,
            }
          : undefined,
      }
    : price != null
      ? {
          "@type": "Offer" as const,
          url: offerUrl,
          priceCurrency: "EUR",
          price: Number(price).toFixed(2),
          availability: "https://schema.org/InStock",
          seller: shopName
            ? {
                "@type": "Organization" as const,
                name: shopName,
              }
            : undefined,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: pubProductDisplayTitle(product),
        description: getPubProductMetaDescription(product),
        inLanguage: "it-IT",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${url}#product` },
        ...(dateModified ? { dateModified } : {}),
      },
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: product.product_name,
        description:
          product.description ?? getPubProductMetaDescription(product),
        brand: product.brand
          ? { "@type": "Brand", name: product.brand }
          : undefined,
        sku: product.id,
        offers: offer,
        ...(dateModified ? { dateModified } : {}),
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
            name: product.product_name,
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
