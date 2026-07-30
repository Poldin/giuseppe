import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import {
  fetchTypeLanderHubList,
  searchTypeLanders,
} from "@/app/lib/category/type-lander";
import { formatPubPrice } from "@/app/lib/pub/product";
import {
  typeLanderHubAbsoluteUrl,
  typeLanderHubPath,
  typeLanderPath,
} from "@/app/lib/seo/type-lander";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Categorie prodotti dentali — prezzi medi e catalogo",
  description: `Esplora categorie tipologiche e linee prodotto dentali su ${SITE_NAME}: quantità, prezzo medio e confronti dai principali ecommerce.`,
  alternates: { canonical: typeLanderHubPath() },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: typeLanderHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `Categorie prodotti dentali | ${SITE_NAME}`,
    description: `Categorie tipologiche e linee prodotto con quantità e prezzo medio su ${SITE_NAME}.`,
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

export default async function CategorieHubPage({ searchParams }: PageProps) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const rows = q ? await searchTypeLanders(q) : await fetchTypeLanderHubList();

  return (
    <SeoHubSearch
      hubPath={typeLanderHubPath()}
      breadcrumbLabel="Categorie"
      title="Categorie prodotti"
      description="Tipologie e linee prodotto con quantità e prezzo medio di catalogo. Digita un nome: frese, camici, Bonartic…"
      searchLabel="Cerca categoria"
      placeholder="Es. frese, denti, Bonartic"
      emptyHint="Digita una categoria o una linea prodotto."
      q={q}
      inputId="categorie-q"
      hits={rows.map((hit) => {
        const count = hit.product_count.toLocaleString("it-IT");
        const avg = formatPubPrice(hit.avg_price);
        return {
          href: typeLanderPath(hit.slug),
          title: hit.seo_title,
          eyebrow: avg ? `${count} prodotti · media ${avg}` : `${count} prodotti`,
          hint: "Apri categoria",
        };
      })}
    />
  );
}
