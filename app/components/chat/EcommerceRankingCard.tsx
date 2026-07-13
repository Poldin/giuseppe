"use client";

import type { TabellaEcommerce } from "@/app/lib/search/elabora-scenari";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

const medalEmoji = ["🥇", "🥈", "🥉"] as const;

export function EcommerceRankingCard({
  tabelle,
  onNavigateToEcommerceTable,
  onExploreAll,
}: {
  tabelle: TabellaEcommerce[];
  onNavigateToEcommerceTable?: (ecommerceId: string) => void;
  onExploreAll?: () => void;
}) {
  const topTabelle = tabelle.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-2xl">
      <header className="px-3 py-2.5 sm:px-4 sm:py-3">
        <h3 className="text-base font-bold sm:text-lg">Classifica fornitori</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500 sm:text-xs">
          scopri chi offre di più.
        </p>
      </header>

      {tabelle.length === 0 ? (
        <p className="p-6 text-center text-sm text-zinc-500">
          Nessuna selezione attiva. Seleziona almeno un prodotto per referenza.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 p-3 sm:p-4">
          {topTabelle.map((tabella, index) => (
            <li
              key={tabella.ecommerce_id}
              className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="shrink-0 text-base leading-none"
                  aria-hidden="true"
                >
                  {medalEmoji[index]}
                </span>
                <div className="inline-flex h-5 min-w-0 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                  {tabella.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tabella.logo_url}
                      alt={tabella.ecommerce_name}
                      className="h-full w-auto max-w-full object-contain object-left"
                    />
                  ) : (
                    <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
                      {tabella.ecommerce_name.slice(0, 2)}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Copertura
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums">
                    {tabella.copertura}/{tabella.copertura_totale}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Totale
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums">
                    {formatPrice(tabella.prezzo_totale)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug tabular-nums text-zinc-500 dark:text-zinc-400">
                    prodotti {formatPrice(tabella.prezzo_prodotti)} · sped.{" "}
                    {formatPrice(tabella.prezzo_spedizione)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigateToEcommerceTable?.(tabella.ecommerce_id)
                }
                className="mt-2.5 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label={`Esplora il confronto ${tabella.ecommerce_name}`}
              >
                esplora
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
