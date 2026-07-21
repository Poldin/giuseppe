import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { MedicalDeviceView } from "@/app/components/medical-device/MedicalDeviceView";
import {
  fetchMedicalDeviceBySlug,
  medicalDeviceDisplayName,
} from "@/app/lib/medical-device/device";
import {
  getMedicalDeviceDateModified,
  getMedicalDeviceJsonLd,
  getMedicalDeviceMetaDescription,
  medicalDeviceAbsoluteUrl,
  medicalDeviceDisplayTitle,
  medicalDevicePath,
} from "@/app/lib/seo/medical-device";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * ISR (non SSR a ogni request): dati Repertorio stabili, aggiornamenti Ministero ~settimanali.
 * HTML in cache 7 giorni → pagine leggere per crawler e visitatori.
 */
export const revalidate = 604800;

type MedicalDevicePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: MedicalDevicePageProps): Promise<Metadata> {
  const { slug: raw } = await params;
  const device = await fetchMedicalDeviceBySlug(raw);
  if (!device) {
    return {
      title: "Dispositivo non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = medicalDeviceDisplayTitle(device);
  const description = getMedicalDeviceMetaDescription(device);
  const canonical = medicalDevicePath(device.slug);
  const absoluteUrl = medicalDeviceAbsoluteUrl(device.slug);
  const dateModified = getMedicalDeviceDateModified(device);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: absoluteUrl,
      siteName: SITE_NAME,
      title,
      description,
      ...(dateModified ? { modifiedTime: dateModified } : {}),
      images: [
        {
          url: "/giuseppe.jpeg",
          width: 1200,
          height: 1200,
          alt: `${SITE_NAME} — ${medicalDeviceDisplayName(device)}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/giuseppe.jpeg"],
    },
  };
}

export default async function MedicalDevicePage({
  params,
}: MedicalDevicePageProps) {
  const { slug: raw } = await params;
  const device = await fetchMedicalDeviceBySlug(raw);
  if (!device) {
    notFound();
  }

  const jsonLd = getMedicalDeviceJsonLd(device);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MedicalDeviceView device={device} />
      <ChatSponsoredBanner />
    </>
  );
}
