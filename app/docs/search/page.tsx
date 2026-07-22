import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { searchDocuments } from "@/app/lib/docs/document";
import {
  assetTypeLabel,
  assetTypeShort,
  docsPath,
} from "@/app/lib/seo/docs";
import { SITE_NAME, SITE_URL } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Cerca documenti tecnici dentali (SDS, IFU, certificati)",
  description: `Cerca e scarica schede di sicurezza (SDS), istruzioni per l'uso (IFU), certificati e documenti tecnici dei fabbricanti dentali su ${SITE_NAME}.`,
  alternates: {
    canonical: "/docs/search",
  },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: `${SITE_URL}/docs/search`,
    siteName: SITE_NAME,
    title: `Cerca documenti tecnici dentali | ${SITE_NAME}`,
    description: `SDS, IFU e documenti tecnici dei fabbricanti — download PDF su ${SITE_NAME}.`,
    images: [
      {
        url: "/giuseppe.jpeg",
        width: 1200,
        height: 1200,
        alt: SITE_NAME,
      },
    ],
  },
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function DocsSearchPage({ searchParams }: SearchPageProps) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const hits = q ? await searchDocuments(q) : [];

  return (
    <>
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
              <li className="text-zinc-500">Documenti tecnici</li>
            </ol>
          </nav>

          <header className="flex flex-col gap-3">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
              Cerca documenti tecnici
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Schede di sicurezza (SDS), istruzioni per l&apos;uso (IFU),
              certificati e altri PDF dei fabbricanti dentali.
            </p>
          </header>

          <form method="get" action="/docs/search" className="mt-8">
            <label htmlFor="docs-q" className="sr-only">
              Cerca documento
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="docs-q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Es. Calibra SDS Dentsply"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none ring-zinc-900 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
              />
              <button
                type="submit"
                className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                Cerca
              </button>
            </div>
          </form>

          {q ? (
            <section className="mt-10" aria-label="Risultati ricerca">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
                {hits.length} risultat{hits.length === 1 ? "o" : "i"} per «{q}»
              </h2>
              {hits.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Nessun documento trovato. Prova con il nome prodotto o il
                  fabbricante (es. «ProRoot SDS», «WaveOne IFU»).
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {hits.map((hit) => (
                    <li key={hit.slug} className="py-4">
                      <Link
                        href={docsPath(hit.slug)}
                        className="group block"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {assetTypeShort(hit.asset_type)}
                          {hit.source_name ? ` · ${hit.source_name}` : ""}
                          {!hit.is_active ? " · non più attivo" : ""}
                        </p>
                        <p className="mt-1 text-sm font-bold leading-snug group-hover:underline">
                          {hit.title}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {assetTypeLabel(hit.asset_type)} — apri scheda e
                          scarica PDF
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <p className="mt-10 text-sm leading-relaxed text-zinc-500">
              Digita un prodotto o un tipo documento. Esempi: «Lucitone SDS»,
              «Calibra», «ProTaper IFU».
            </p>
          )}
        </main>
      </div>
      <ChatSponsoredBanner />
    </>
  );
}
