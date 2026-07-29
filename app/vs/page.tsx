import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import {
  vsHubAbsoluteUrl,
  vsHubPath,
  vsCombinationPath,
} from "@/app/lib/seo/vs-combination";
import { SITE_NAME } from "@/app/lib/seo/site";
import {
  fetchVsHubSamples,
  searchVsCombinations,
} from "@/app/lib/vs/combination";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Confronti prezzi dentali — miglior prezzo tra shop",
  description: `Cerca il miglior prezzo tra ecommerce dentali su ${SITE_NAME}: stesso prodotto, shop diversi, differenza di prezzo in chiaro.`,
  alternates: { canonical: vsHubPath() },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: vsHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `Miglior prezzo a confronto | ${SITE_NAME}`,
    description: `Trova il miglior prezzo tra shop dentali su ${SITE_NAME}.`,
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

export default async function VsHubPage({ searchParams }: PageProps) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const rows = q ? await searchVsCombinations(q) : await fetchVsHubSamples();

  return (
    <SeoHubSearch
      hubPath={vsHubPath()}
      breadcrumbLabel="Confronti prezzi"
      title="Cerca il miglior prezzo"
      description="Stesso prodotto, shop diversi: trova il miglior prezzo e la differenza in chiaro. Digita un nome: mostriamo fino a 20 risultati."
      searchLabel="Cerca confronto"
      placeholder="Es. guanti, composite, abutment"
      emptyHint="Digita un prodotto per trovare i confronti disponibili."
      q={q}
      inputId="vs-q"
      hits={rows.map((hit) => ({
        href: vsCombinationPath(hit.slug),
        title: hit.canonical_name,
        hint: "Apri miglior prezzo",
      }))}
    />
  );
}
