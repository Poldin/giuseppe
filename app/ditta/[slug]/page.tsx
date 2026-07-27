import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { DittaView } from "@/app/components/aifa/AifaViews";
import {
  fetchActiveMedicinesByCompanyId,
  fetchAifaCompanyBySlug,
} from "@/app/lib/aifa/queries";
import { dittaAbsoluteUrl, dittaPath, dittaTitle } from "@/app/lib/seo/aifa";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 86400;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const company = await fetchAifaCompanyBySlug(slug);
  if (!company) {
    return { title: "Ditta non trovata", robots: { index: false, follow: false } };
  }
  const title = dittaTitle(company);
  const description =
    `Farmaci di ${company.name} nella Lista di trasparenza AIFA: prezzi pubblici e differenza rispetto al riferimento SSN.`.slice(
      0,
      160
    );
  return {
    title,
    description,
    alternates: { canonical: dittaPath(company.slug) },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: dittaAbsoluteUrl(company.slug),
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

export default async function DittaPage({ params }: PageProps) {
  const { slug } = await params;
  const company = await fetchAifaCompanyBySlug(slug);
  if (!company) notFound();
  const medicines = await fetchActiveMedicinesByCompanyId(company.id);

  return (
    <>
      <DittaView company={company} medicines={medicines} />
      <ChatSponsoredBanner />
    </>
  );
}
