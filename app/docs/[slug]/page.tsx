import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { DocView } from "@/app/components/docs/DocView";
import {
  decodeDocSlugParam,
  fetchDocumentBySlug,
} from "@/app/lib/docs/document";
import {
  docDisplayTitle,
  docsAbsoluteUrl,
  docsPath,
  getDocDateModified,
  getDocJsonLd,
  getDocMetaDescription,
  manufacturerName,
} from "@/app/lib/seo/docs";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** ISR: i documenti fabbricante cambiano raramente; cache HTML 24h. */
export const revalidate = 86400;

type DocPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = decodeDocSlugParam(raw);
  const doc = await fetchDocumentBySlug(slug);
  if (!doc) {
    return {
      title: "Documento non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = docDisplayTitle(doc);
  const description = getDocMetaDescription(doc);
  const canonical = docsPath(doc.slug);
  const absoluteUrl = docsAbsoluteUrl(doc.slug);
  const dateModified = getDocDateModified(doc);

  return {
    title,
    description,
    keywords: [
      assetKeyword(doc.asset_type),
      manufacturerName(doc),
      "download",
      "PDF",
      doc.title,
      "studio dentistico",
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
      ...(dateModified ? { modifiedTime: dateModified } : {}),
      images: [
        {
          url: "/giuseppe.jpeg",
          width: 1200,
          height: 1200,
          alt: `${SITE_NAME} — ${doc.title}`,
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

function assetKeyword(assetType: string): string {
  if (assetType === "sds") return "scheda di sicurezza SDS";
  if (assetType === "ifu") return "istruzioni per l'uso IFU";
  return assetType.replaceAll("_", " ");
}

export default async function DocPage({ params }: DocPageProps) {
  const { slug: raw } = await params;
  const slug = decodeDocSlugParam(raw);
  const doc = await fetchDocumentBySlug(slug);
  if (!doc) {
    notFound();
  }

  const jsonLd = getDocJsonLd(doc);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DocView doc={doc} />
      <ChatSponsoredBanner />
    </>
  );
}
