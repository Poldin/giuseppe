import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { ListaTrasparenzaView } from "@/app/components/aifa/AifaViews";
import {
  countAifaGroupsForSitemap,
  countAifaIngredientsForSitemap,
  countAifaMedicinesForSitemap,
  fetchHubSampleGroups,
  fetchLatestAifaRelease,
} from "@/app/lib/aifa/queries";
import {
  formatAifaDateIt,
  listaTrasparenzaAbsoluteUrl,
  listaTrasparenzaPath,
} from "@/app/lib/seo/aifa";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const release = await fetchLatestAifaRelease();
  const date = formatAifaDateIt(release?.published_on);
  const title = "Lista di trasparenza AIFA — prezzi farmaci equivalenti";
  const description = (
    `Confronta prezzi pubblici e prezzo di riferimento SSN dei farmaci equivalenti ` +
    `dalla Lista di trasparenza AIFA` +
    (date ? ` (aggiornamento ${date})` : "") +
    `.`
  ).slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: listaTrasparenzaPath() },
    openGraph: {
      type: "website",
      locale: "it_IT",
      url: listaTrasparenzaAbsoluteUrl(),
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: "/giuseppe.jpeg", width: 1200, height: 1200, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/giuseppe.jpeg"],
    },
  };
}

export default async function ListaTrasparenzaPage() {
  const [release, groups, medicines, groupCount, ingredientCount] =
    await Promise.all([
      fetchLatestAifaRelease(),
      fetchHubSampleGroups(),
      countAifaMedicinesForSitemap(),
      countAifaGroupsForSitemap(),
      countAifaIngredientsForSitemap(),
    ]);

  return (
    <>
      <ListaTrasparenzaView
        release={release}
        groups={groups}
        stats={{
          medicines,
          groups: groupCount,
          ingredients: ingredientCount,
        }}
      />
      <ChatSponsoredBanner />
    </>
  );
}
