import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import { SeoHubSearchFallback } from "@/app/components/seo/SeoHubSearchFallback";
import { fetchRecallHubSamples } from "@/app/lib/recall/recall";
import {
  recallHubAbsoluteUrl,
  recallHubPath,
  recallPath,
} from "@/app/lib/seo/recall";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Avvisi di sicurezza dispositivi medici",
  description: `Cerca avvisi di sicurezza e recall di dispositivi medici pubblicati dal Ministero della Salute, ripubblicati su ${SITE_NAME}.`,
  alternates: { canonical: recallHubPath() },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: recallHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `Avvisi di sicurezza | ${SITE_NAME}`,
    description: `Cerca recall e avvisi di sicurezza su dispositivi medici su ${SITE_NAME}.`,
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

export default async function RecallHubPage() {
  const rows = await fetchRecallHubSamples();
  const sampleHits = rows.map((hit) => {
    const meta = [hit.fabbricante, hit.tipo_dispositivo]
      .filter(Boolean)
      .join(" · ");
    return {
      href: recallPath(hit.numero_riferimento),
      title: hit.name,
      eyebrow: meta || `N. ${hit.numero_riferimento}`,
      hint: `Avviso ${hit.numero_riferimento} — apri scheda`,
    };
  });

  const props = {
    hub: "recall" as const,
    hubPath: recallHubPath(),
    breadcrumbLabel: "Avvisi di sicurezza",
    title: "Cerca avvisi di sicurezza",
    description:
      "Avvisi e recall di dispositivi medici dal Ministero della Salute. Digita dispositivo, fabbricante o numero: fino a 20 risultati.",
    searchLabel: "Cerca avviso",
    placeholder: "Es. fabbricante, dispositivo, numero",
    emptyHint:
      "Digita un dispositivo, un fabbricante o un numero di riferimento.",
    sampleHits,
    inputId: "recall-q",
  };

  return (
    <Suspense fallback={<SeoHubSearchFallback {...props} />}>
      <SeoHubSearch {...props} />
    </Suspense>
  );
}
