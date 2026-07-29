import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import {
  fetchPubHubSamples,
  formatPubPrice,
  searchPubProducts,
} from "@/app/lib/pub/product";
import {
  pubHubAbsoluteUrl,
  pubHubPath,
  pubProductPath,
} from "@/app/lib/seo/pub-product";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Prodotti dentali — cerca prezzi e schede",
  description: `Cerca prodotti e materiali dentali confrontati da ${SITE_NAME}: prezzi aggiornati da Gerhò, Dontalia, Dentaltix e Abutment Compatibili.`,
  alternates: { canonical: pubHubPath() },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: pubHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `Prodotti dentali | ${SITE_NAME}`,
    description: `Cerca prodotti e materiali dentali con prezzi aggiornati su ${SITE_NAME}.`,
    images: [
      {
        url: "/giuseppe.jpeg",
        width: 1200,
        height: 1200,
        alt: SITE_NAME,
      },
    ],
  },
};

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PubHubPage({ searchParams }: PageProps) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const rows = q ? await searchPubProducts(q) : await fetchPubHubSamples();

  return (
    <SeoHubSearch
      hubPath={pubHubPath()}
      breadcrumbLabel="Prodotti"
      title="Cerca prodotti"
      description="Schede prodotto con prezzi dai principali ecommerce dentali. Digita un nome o un brand: mostriamo fino a 20 risultati."
      searchLabel="Cerca prodotto"
      placeholder="Es. guanti nitrile, composite 3M"
      emptyHint="Digita un prodotto o un brand per iniziare."
      q={q}
      inputId="pub-q"
      hits={rows.map((hit) => {
        const price = formatPubPrice(hit.final_price);
        const meta = [hit.brand, hit.shop_name].filter(Boolean).join(" · ");
        return {
          href: pubProductPath(hit.pub_slug),
          title: hit.product_name,
          eyebrow: meta || null,
          hint: price ? `${price} — apri scheda` : "Apri scheda prodotto",
        };
      })}
    />
  );
}
