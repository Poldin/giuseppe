import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { TypeLanderView } from "@/app/components/category/TypeLanderView";
import {
  fetchTypeLanderBySlug,
  fetchTypeLanderSlugs,
} from "@/app/lib/category/type-lander";
import {
  getTypeLanderJsonLd,
  getTypeLanderMetaDescription,
  typeLanderAbsoluteUrl,
  typeLanderDisplayTitle,
  typeLanderPath,
} from "@/app/lib/seo/type-lander";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** ISR: lander tipologici, aggiornamento almeno ogni 24 ore. */
export const revalidate = 86400;

type TypeLanderPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await fetchTypeLanderSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: TypeLanderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const lander = await fetchTypeLanderBySlug(slug);
  if (!lander) {
    return {
      title: "Categoria non trovata",
      robots: { index: false, follow: false },
    };
  }

  const title = typeLanderDisplayTitle(lander);
  const description = getTypeLanderMetaDescription(lander);
  const canonical = typeLanderPath(lander.slug);
  const absoluteUrl = typeLanderAbsoluteUrl(lander.slug);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
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
          alt: `${SITE_NAME} — ${title}`,
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

export default async function TypeLanderPage({ params }: TypeLanderPageProps) {
  const { slug } = await params;
  const lander = await fetchTypeLanderBySlug(slug);
  if (!lander) {
    notFound();
  }

  const jsonLd = getTypeLanderJsonLd(lander);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TypeLanderView lander={lander} />
      <ChatSponsoredBanner />
    </>
  );
}
