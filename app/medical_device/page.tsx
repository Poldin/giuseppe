import { SeoHubSearch } from "@/app/components/seo/SeoHubSearch";
import { SeoHubSearchFallback } from "@/app/components/seo/SeoHubSearchFallback";
import { fetchMedicalDeviceHubSamples } from "@/app/lib/medical-device/device";
import {
  medicalDeviceHubAbsoluteUrl,
  medicalDeviceHubPath,
  medicalDevicePath,
} from "@/app/lib/seo/medical-device";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { Suspense } from "react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Dispositivi medici — cerca nel repertorio",
  description: `Cerca dispositivi medici per denominazione, fabbricante o classificazione CND su ${SITE_NAME}.`,
  alternates: { canonical: medicalDeviceHubPath() },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: medicalDeviceHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `Dispositivi medici | ${SITE_NAME}`,
    description: `Cerca dispositivi medici per nome, fabbricante o CND su ${SITE_NAME}.`,
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

export default async function MedicalDeviceHubPage() {
  const rows = await fetchMedicalDeviceHubSamples();
  const sampleHits = rows.map((hit) => {
    const meta = [hit.fabbricante, hit.classificazione_cnd]
      .filter(Boolean)
      .join(" · ");
    return {
      href: medicalDevicePath(hit.slug),
      title: hit.name,
      eyebrow: meta || null,
      hint: "Apri scheda dispositivo",
    };
  });

  const props = {
    hub: "medical_device" as const,
    hubPath: medicalDeviceHubPath(),
    breadcrumbLabel: "Dispositivi medici",
    title: "Cerca dispositivi medici",
    description:
      "Schede dispositivo per denominazione, fabbricante o classificazione CND. Digita una parola chiave: fino a 20 risultati.",
    searchLabel: "Cerca dispositivo",
    placeholder: "Es. fabbricante, denominazione, CND",
    emptyHint: "Digita una denominazione, un fabbricante o un codice CND.",
    sampleHits,
    inputId: "device-q",
  };

  return (
    <Suspense fallback={<SeoHubSearchFallback {...props} />}>
      <SeoHubSearch {...props} />
    </Suspense>
  );
}
