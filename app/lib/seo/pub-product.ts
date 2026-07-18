import {
  formatPubPrice,
  pubProductDisplayTitle,
  type PubProduct,
} from "@/app/lib/pub/product";
import { SITE_NAME, SITE_URL } from "@/app/lib/seo/site";

export function pubProductPath(slug: string): string {
  return `/pub/${encodeURIComponent(slug)}`;
}

export function pubProductAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${pubProductPath(slug)}`;
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

export function getPubProductJsonLd(product: PubProduct) {
  const url = pubProductAbsoluteUrl(product.pub_slug);
  const price = product.is_escluded ? null : product.final_price;
  const shopName = product.ecommerce?.name ?? undefined;
  const offerUrl = product.original_url ?? url;

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
    ],
  };
}
