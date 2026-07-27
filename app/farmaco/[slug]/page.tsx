import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { FarmacoView } from "@/app/components/aifa/AifaViews";
import {
  fetchAifaMedicineBySlug,
  fetchLatestAifaRelease,
  fetchMedicinePriceHistory,
} from "@/app/lib/aifa/queries";
import {
  farmacoAbsoluteUrl,
  farmacoDescription,
  farmacoPath,
  farmacoTitle,
  getFarmacoJsonLd,
} from "@/app/lib/seo/aifa";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 86400;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [medicine, release] = await Promise.all([
    fetchAifaMedicineBySlug(slug),
    fetchLatestAifaRelease(),
  ]);
  if (!medicine) {
    return { title: "Farmaco non trovato", robots: { index: false, follow: false } };
  }
  const title = farmacoTitle(medicine);
  const description = farmacoDescription(medicine, release);
  return {
    title,
    description,
    alternates: { canonical: farmacoPath(medicine.slug) },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: farmacoAbsoluteUrl(medicine.slug),
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: "/giuseppe.jpeg", width: 1200, height: 1200, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/giuseppe.jpeg"],
    },
  };
}

export default async function FarmacoPage({ params }: PageProps) {
  const { slug } = await params;
  const [medicine, release] = await Promise.all([
    fetchAifaMedicineBySlug(slug),
    fetchLatestAifaRelease(),
  ]);
  if (!medicine) notFound();
  const history = await fetchMedicinePriceHistory(medicine.aic);
  const jsonLd = getFarmacoJsonLd(medicine, release);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FarmacoView medicine={medicine} release={release} history={history} />
      <ChatSponsoredBanner />
    </>
  );
}
