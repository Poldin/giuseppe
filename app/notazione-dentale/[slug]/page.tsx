import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { NotazioneDentaleView } from "@/app/components/notazione-dentale/NotazioneDentaleView";
import { getAllTeeth, getToothBySlug } from "@/app/lib/notazione-dentale/teeth";
import {
  getToothJsonLd,
  getToothMetaDescription,
  notazioneDentaleAbsoluteUrl,
  notazioneDentalePath,
  toothDisplayTitle,
} from "@/app/lib/seo/notazione-dentale";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** Contenuto statico immutabile — cache lunga. */
export const revalidate = false;

type NotazioneDentalePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllTeeth().map((tooth) => ({ slug: tooth.slug }));
}

export async function generateMetadata({
  params,
}: NotazioneDentalePageProps): Promise<Metadata> {
  const { slug: raw } = await params;
  const tooth = getToothBySlug(raw);
  if (!tooth) {
    return {
      title: "Dente non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = toothDisplayTitle(tooth);
  const description = getToothMetaDescription(tooth);
  const canonical = notazioneDentalePath(tooth.slug);
  const absoluteUrl = notazioneDentaleAbsoluteUrl(tooth.slug);

  return {
    title,
    description,
    keywords: [
      `dente FDI ${tooth.fdi}`,
      `Universal ${tooth.universal}`,
      `Palmer ${tooth.palmer_numero}`,
      tooth.nome_anatomico,
      "notazione dentale",
      "ISO 3950",
      ...(tooth.is_dente_giudizio ? ["dente del giudizio", "terzo molare"] : []),
    ],
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
      images: [
        {
          url: "/giuseppe.jpeg",
          width: 1200,
          height: 1200,
          alt: `${SITE_NAME} — ${tooth.nome_anatomico}`,
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

export default async function NotazioneDentalePage({
  params,
}: NotazioneDentalePageProps) {
  const { slug: raw } = await params;
  const tooth = getToothBySlug(raw);
  if (!tooth) {
    notFound();
  }

  const jsonLd = getToothJsonLd(tooth);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NotazioneDentaleView tooth={tooth} />
      <ChatSponsoredBanner />
    </>
  );
}
