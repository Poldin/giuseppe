import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { VsComparisonView } from "@/app/components/vs/VsComparisonView";
import {
  fetchVsCombinationBySlug,
  fetchVsRedirectSlug,
  vsCombinationDisplayTitle,
} from "@/app/lib/vs/combination";
import {
  getVsCombinationCanonicalPath,
  getVsCombinationDateModified,
  getVsCombinationJsonLd,
  getVsCombinationMetaDescription,
  vsCombinationPath,
} from "@/app/lib/seo/vs-combination";
import { SITE_NAME, SITE_URL } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/** ISR: prezzi e dati catalogo si aggiornano almeno ogni 12 ore. */
export const revalidate = 43200;

type VsCombinationPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: VsCombinationPageProps): Promise<Metadata> {
  const { slug } = await params;

  const redirectTo = await fetchVsRedirectSlug(slug);
  if (redirectTo) {
    return {
      alternates: { canonical: vsCombinationPath(redirectTo) },
      robots: { index: false, follow: true },
    };
  }

  const combo = await fetchVsCombinationBySlug(slug);
  if (!combo) {
    return {
      title: "Confronto non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = vsCombinationDisplayTitle(combo);
  const description = getVsCombinationMetaDescription(combo);
  const canonicalPath = getVsCombinationCanonicalPath(combo);
  const absoluteUrl = `${SITE_URL}${canonicalPath}`;
  const dateModified = getVsCombinationDateModified(combo);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
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
          alt: `${SITE_NAME} — ${combo.canonical_name}`,
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

export default async function VsCombinationPage({
  params,
}: VsCombinationPageProps) {
  const { slug } = await params;

  const redirectTo = await fetchVsRedirectSlug(slug);
  if (redirectTo) {
    permanentRedirect(vsCombinationPath(redirectTo));
  }

  const combo = await fetchVsCombinationBySlug(slug);
  if (!combo) {
    notFound();
  }

  const jsonLd = getVsCombinationJsonLd(combo);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VsComparisonView combination={combo} />
      <ChatSponsoredBanner />
    </>
  );
}
