import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import {
  palmerNotation,
  teethGroupedByQuadrant,
} from "@/app/lib/notazione-dentale/teeth";
import {
  getNotazioneDentaleHubDescription,
  getNotazioneDentaleHubJsonLd,
  NOTAZIONE_DENTALE_HUB_TITLE,
  notazioneDentaleHubAbsoluteUrl,
  notazioneDentaleHubPath,
  notazioneDentalePath,
} from "@/app/lib/seo/notazione-dentale";
import { SITE_NAME } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = false;

const description = getNotazioneDentaleHubDescription();

export const metadata: Metadata = {
  title: NOTAZIONE_DENTALE_HUB_TITLE,
  description,
  keywords: [
    "notazione dentale",
    "sistema FDI",
    "ISO 3950",
    "Universal ADA",
    "Palmer",
    "numerazione denti",
    "conversione denti",
  ],
  alternates: {
    canonical: notazioneDentaleHubPath(),
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: notazioneDentaleHubAbsoluteUrl(),
    siteName: SITE_NAME,
    title: `${NOTAZIONE_DENTALE_HUB_TITLE} | ${SITE_NAME}`,
    description,
    images: [
      {
        url: "/giuseppe.jpeg",
        width: 1200,
        height: 1200,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${NOTAZIONE_DENTALE_HUB_TITLE} | ${SITE_NAME}`,
    description,
    images: ["/giuseppe.jpeg"],
  },
};

export default function NotazioneDentaleHubPage() {
  const groups = teethGroupedByQuadrant();
  const jsonLd = getNotazioneDentaleHubJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
              <li>
                <Link
                  href="/"
                  className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Giuseppe
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-zinc-500">Notazione dentale</li>
            </ol>
          </nav>

          <header className="flex flex-col gap-3">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
              Notazione dentale
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Conversione dei 32 denti permanenti tra sistema FDI (ISO 3950),
              Universal (ADA) e Palmer. Apri una scheda per dettagli e FAQ.
            </p>
          </header>

          {groups.map((group) => (
            <section
              key={group.id}
              className="mt-10"
              aria-labelledby={`q${group.id}-heading`}
            >
              <h2
                id={`q${group.id}-heading`}
                className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500"
              >
                Quadrante {group.id} — {group.nome}
              </h2>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {group.teeth.map((tooth) => (
                  <li key={tooth.slug} className="py-3.5">
                    <Link
                      href={notazioneDentalePath(tooth.slug)}
                      className="group block"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        FDI {tooth.fdi}
                        {tooth.is_dente_giudizio ? " · dente del giudizio" : ""}
                      </p>
                      <p className="mt-1 text-sm font-bold leading-snug group-hover:underline">
                        {tooth.nome_anatomico}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Universal {tooth.universal} · Palmer{" "}
                        {palmerNotation(tooth)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      </div>
      <ChatSponsoredBanner />
    </>
  );
}
