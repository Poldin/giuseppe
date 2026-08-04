import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import { SeoHubSearchFallback } from "@/app/components/seo/SeoHubSearchFallback";
import { SITE_NAME, SITE_URL } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Cerca documenti tecnici dentali (SDS, IFU, certificati)",
  description: `Cerca e scarica schede di sicurezza (SDS), istruzioni per l'uso (IFU), certificati e documenti tecnici dei fabbricanti dentali su ${SITE_NAME}.`,
  alternates: {
    canonical: "/docs/search",
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: `${SITE_URL}/docs/search`,
    siteName: SITE_NAME,
    title: `Cerca documenti tecnici dentali | ${SITE_NAME}`,
    description: `SDS, IFU e documenti tecnici dei fabbricanti — download PDF su ${SITE_NAME}.`,
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

export default function DocsSearchPage() {
  const props = {
    hub: "docs" as const,
    hubPath: "/docs/search",
    breadcrumbLabel: "Documenti tecnici",
    title: "Cerca documenti tecnici",
    description:
      "Schede di sicurezza (SDS), istruzioni per l'uso (IFU), certificati e altri PDF dei fabbricanti dentali.",
    searchLabel: "Cerca documento",
    placeholder: "Es. Calibra SDS Dentsply",
    emptyHint:
      "Digita un prodotto o un tipo documento. Esempi: «Lucitone SDS», «Calibra», «ProTaper IFU».",
    sampleHits: [],
    inputId: "docs-q",
  };

  return (
    <Suspense fallback={<SeoHubSearchFallback {...props} />}>
      <SeoHubSearch {...props} />
    </Suspense>
  );
}
