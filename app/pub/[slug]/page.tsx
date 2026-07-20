import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { PubProductView } from "@/app/components/pub/PubProductView";
import {
  fetchPubProductBySlug,
  pubProductDisplayTitle,
} from "@/app/lib/pub/product";
import {
  getPubProductDateModified,
  getPubProductJsonLd,
  getPubProductMetaDescription,
  pubProductAbsoluteUrl,
  pubProductPath,
} from "@/app/lib/seo/pub-product";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** ISR: prezzi e dati catalogo si aggiornano almeno ogni 12 ore. */
export const revalidate = 43200;

type PubProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PubProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchPubProductBySlug(slug);
  if (!product) {
    return {
      title: "Prodotto non trovato",
      robots: { index: false, follow: false },
    };
  }

  const title = pubProductDisplayTitle(product);
  const description = getPubProductMetaDescription(product);
  const canonical = pubProductPath(product.pub_slug);
  const absoluteUrl = pubProductAbsoluteUrl(product.pub_slug);
  const dateModified = getPubProductDateModified(product);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      // Next non espone og:type "product"; article + modifiedTime comunica la freschezza da update_at.
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
          alt: `${SITE_NAME} — ${product.product_name}`,
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

export default async function PubProductPage({ params }: PubProductPageProps) {
  const { slug } = await params;
  const product = await fetchPubProductBySlug(slug);
  if (!product) {
    notFound();
  }

  const jsonLd = getPubProductJsonLd(product);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PubProductView product={product} />
      <ChatSponsoredBanner />
    </>
  );
}
