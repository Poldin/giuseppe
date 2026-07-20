import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { RecallView } from "@/app/components/recall/RecallView";
import {
  decodeRecallNumeroParam,
  fetchRecallByNumero,
  recallDisplayName,
} from "@/app/lib/recall/recall";
import {
  getRecallDateModified,
  getRecallJsonLd,
  getRecallMetaDescription,
  recallAbsoluteUrl,
  recallDisplayTitle,
  recallPath,
} from "@/app/lib/seo/recall";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** ISR: gli avvisi cambiano raramente; cache HTML 24h. */
export const revalidate = 86400;

type RecallPageProps = {
  params: Promise<{ number: string }>;
};

export async function generateMetadata({
  params,
}: RecallPageProps): Promise<Metadata> {
  const { number: raw } = await params;
  const numero = decodeRecallNumeroParam(raw);
  const recall = await fetchRecallByNumero(numero);
  if (!recall) {
    return {
      title: "Avviso non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = recallDisplayTitle(recall);
  const description = getRecallMetaDescription(recall);
  const canonical = recallPath(recall.numero_riferimento);
  const absoluteUrl = recallAbsoluteUrl(recall.numero_riferimento);
  const dateModified = getRecallDateModified(recall);

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
          alt: `${SITE_NAME} — ${recallDisplayName(recall)}`,
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

export default async function RecallPage({ params }: RecallPageProps) {
  const { number: raw } = await params;
  const numero = decodeRecallNumeroParam(raw);
  const recall = await fetchRecallByNumero(numero);
  if (!recall) {
    notFound();
  }

  const jsonLd = getRecallJsonLd(recall);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RecallView recall={recall} />
      <ChatSponsoredBanner />
    </>
  );
}
