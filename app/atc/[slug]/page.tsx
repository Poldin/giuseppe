import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { AtcView } from "@/app/components/aifa/AifaViews";
import {
  fetchAifaAtcBySlug,
  fetchGroupsByAtcId,
} from "@/app/lib/aifa/queries";
import { atcAbsoluteUrl, atcPath, atcTitle } from "@/app/lib/seo/aifa";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 86400;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const atc = await fetchAifaAtcBySlug(slug);
  if (!atc) {
    return { title: "ATC non trovato", robots: { index: false, follow: false } };
  }
  const title = atcTitle(atc);
  const description =
    `Gruppi di equivalenza AIFA con codice ATC ${atc.code}: confronti prezzi dalla Lista di trasparenza.`.slice(
      0,
      160
    );
  return {
    title,
    description,
    alternates: { canonical: atcPath(atc.slug) },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: atcAbsoluteUrl(atc.slug),
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

export default async function AtcPage({ params }: PageProps) {
  const { slug } = await params;
  const atc = await fetchAifaAtcBySlug(slug);
  if (!atc) notFound();
  const groups = await fetchGroupsByAtcId(atc.id);

  return (
    <>
      <AtcView atc={atc} groups={groups} />
      <ChatSponsoredBanner />
    </>
  );
}
