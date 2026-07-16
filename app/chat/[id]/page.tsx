import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatConfrontoClient } from "@/app/components/chat/ChatConfrontoClient";
import { ChatSponsoredBanner } from "@/app/components/chat/ChatSponsoredBanner";
import { ShareResultsButton } from "@/app/components/chat/ShareResultsButton";
import { HowItWorksButton } from "@/app/components/onboarding/HowItWorksButton";
import { getProductSearchChat } from "@/app/lib/search/chat-store";
import type { RisultatoConfronto } from "@/app/lib/search/elabora-scenari";
import type { ProductSearchResult } from "@/app/lib/search/types";

type ChatPageProps = {
  params: Promise<{ id: string }>;
};

function isConfronto(value: unknown): value is RisultatoConfronto {
  return (
    typeof value === "object" &&
    value !== null &&
    "tabelle_ecommerce" in value &&
    "scenario_risparmio" in value
  );
}

function LegacyResultsTable({ results }: { results: ProductSearchResult[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        <thead className="bg-zinc-50 dark:bg-zinc-900/70">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Prodotto</th>
            <th className="px-4 py-3 text-left font-semibold">Piattaforma</th>
            <th className="px-4 py-3 text-left font-semibold">Risultato</th>
            <th className="px-4 py-3 text-left font-semibold">Link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {results.map((row, index) => (
            <tr key={`${row.product}-${row.platform}-${index}`}>
              <td className="px-4 py-3 align-top font-medium">{row.product}</td>
              <td className="px-4 py-3 align-top">{row.platform}</td>
              <td className="px-4 py-3 align-top">
                <div className="flex flex-col gap-1">
                  <span>{row.title}</span>
                  {row.description ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {row.description}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-4 py-3 align-top">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-900 underline underline-offset-2 transition-colors hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    Apri
                  </a>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaticConfrontoFallback() {
  return (
    <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
      Questa ricerca usa un formato precedente. Esegui una nuova ricerca per
      usare la selezione prodotti e il ricalcolo live.
    </p>
  );
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const chat = await getProductSearchChat(id);

  if (!chat) {
    notFound();
  }

  const confronto = isConfronto(chat.results) ? chat.results : null;
  const legacyResults = Array.isArray(chat.results)
    ? (chat.results as ProductSearchResult[])
    : [];
  const hasLiveConfronto = Boolean(confronto?.top_match_per_referenza?.length);

  return (
    <div className="min-h-screen w-full min-w-0 bg-white font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto w-full min-w-0 max-w-6xl px-1 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-3 pr-36 sm:mb-8 sm:pr-0">
          <Link
            href="/"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← torna indietro
          </Link>
          <h1 className="text-3xl font-black uppercase tracking-tighter sm:text-4xl">
            Risultati
          </h1>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <HowItWorksButton />
              <div
                id="chat-share-buttons"
                className="flex flex-wrap items-center gap-2"
              >
                {!hasLiveConfronto ? <ShareResultsButton /> : null}
              </div>
            </div>
            <div id="chat-richiesta-summary" className="min-w-0" />
          </div>
        </div>

        {confronto ? (
          hasLiveConfronto ? (
            <ChatConfrontoClient chatId={id} confronto={confronto} />
          ) : (
            <StaticConfrontoFallback />
          )
        ) : (
          <LegacyResultsTable results={legacyResults} />
        )}
      </main>
      <ChatSponsoredBanner />
    </div>
  );
}
