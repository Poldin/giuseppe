import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import type { SeoHubHit } from "@/app/lib/seo/hub-hit";
import Link from "next/link";

/** Fallback Suspense: hub ISR senza useSearchParams. */
export function SeoHubSearchFallback({
  hubPath,
  breadcrumbLabel,
  title,
  description,
  searchLabel,
  placeholder,
  emptyHint,
  sampleHits,
  inputId,
}: {
  hubPath: string;
  breadcrumbLabel: string;
  title: string;
  description: string;
  searchLabel: string;
  placeholder: string;
  emptyHint: string;
  sampleHits: SeoHubHit[];
  inputId: string;
}) {
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
              <li className="text-zinc-500">{breadcrumbLabel}</li>
            </ol>
          </nav>

          <header className="flex flex-col gap-3">
            <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </header>

          <form method="get" action={hubPath} className="mt-8">
            <label htmlFor={inputId} className="sr-only">
              {searchLabel}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id={inputId}
                name="q"
                type="search"
                placeholder={placeholder}
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

          <section className="mt-10" aria-label="Risultati">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Esempi recenti
            </h2>
            {sampleHits.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {emptyHint}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {sampleHits.map((hit) => (
                  <li key={hit.href} className="py-4">
                    <Link href={hit.href} className="group block">
                      {hit.eyebrow ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          {hit.eyebrow}
                        </p>
                      ) : null}
                      <p
                        className={`text-sm font-bold leading-snug group-hover:underline ${hit.eyebrow ? "mt-1" : ""}`}
                      >
                        {hit.title}
                      </p>
                      {hit.hint ? (
                        <p className="mt-1 text-xs text-zinc-500">{hit.hint}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-10 text-sm leading-relaxed text-zinc-500">
            Per confrontare prezzi e creare un ordine,{" "}
            <Link
              href="/"
              className="font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              torna alla home
            </Link>
            .
          </p>
        </main>
      </div>
      <ChatSponsoredBanner />
    </>
  );
}
