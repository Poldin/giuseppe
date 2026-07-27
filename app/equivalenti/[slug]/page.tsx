import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { EquivalentiView } from "@/app/components/aifa/AifaViews";
import {
  fetchActiveMedicinesByGroupId,
  fetchAifaGroupBySlug,
  fetchLatestAifaRelease,
} from "@/app/lib/aifa/queries";
import {
  equivalentiAbsoluteUrl,
  equivalentiDescription,
  equivalentiPath,
  equivalentiTitle,
  getEquivalentiJsonLd,
} from "@/app/lib/seo/aifa";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** Aggiornamento AIFA ~mensile: cache 1 giorno. */
export const revalidate = 86400;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const [group, release] = await Promise.all([
    fetchAifaGroupBySlug(slug),
    fetchLatestAifaRelease(),
  ]);
  if (!group) {
    return { title: "Gruppo non trovato", robots: { index: false, follow: false } };
  }
  const medicines = await fetchActiveMedicinesByGroupId(group.id);
  const title = equivalentiTitle(group);
  const description = equivalentiDescription(group, medicines, release);
  return {
    title,
    description,
    alternates: { canonical: equivalentiPath(group.slug) },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: equivalentiAbsoluteUrl(group.slug),
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

export default async function EquivalentiPage({ params }: PageProps) {
  const { slug } = await params;
  const [group, release] = await Promise.all([
    fetchAifaGroupBySlug(slug),
    fetchLatestAifaRelease(),
  ]);
  if (!group) notFound();
  const medicines = await fetchActiveMedicinesByGroupId(group.id);
  const jsonLd = getEquivalentiJsonLd(group, medicines, release);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EquivalentiView group={group} medicines={medicines} release={release} />
      <ChatSponsoredBanner />
    </>
  );
}
