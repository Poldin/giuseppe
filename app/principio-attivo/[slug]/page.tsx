import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { PrincipioAttivoView } from "@/app/components/aifa/AifaViews";
import {
  fetchAifaIngredientBySlug,
  fetchGroupsByIngredientId,
  fetchLatestAifaRelease,
} from "@/app/lib/aifa/queries";
import {
  principioAttivoAbsoluteUrl,
  principioAttivoPath,
  principioTitle,
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
  const ingredient = await fetchAifaIngredientBySlug(slug);
  if (!ingredient) {
    return {
      title: "Principio attivo non trovato",
      robots: { index: false, follow: false },
    };
  }
  const title = principioTitle(ingredient);
  const description =
    `Gruppi di equivalenza e prezzi AIFA per ${ingredient.name}: confronta i farmaci equivalenti ` +
    `dalla Lista di trasparenza.`.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: principioAttivoPath(ingredient.slug) },
    openGraph: {
      type: "article",
      locale: "it_IT",
      url: principioAttivoAbsoluteUrl(ingredient.slug),
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

export default async function PrincipioAttivoPage({ params }: PageProps) {
  const { slug } = await params;
  const [ingredient, release] = await Promise.all([
    fetchAifaIngredientBySlug(slug),
    fetchLatestAifaRelease(),
  ]);
  if (!ingredient) notFound();
  const groups = await fetchGroupsByIngredientId(ingredient.id);

  return (
    <>
      <PrincipioAttivoView
        ingredient={ingredient}
        groups={groups}
        release={release}
      />
      <ChatSponsoredBanner />
    </>
  );
}
