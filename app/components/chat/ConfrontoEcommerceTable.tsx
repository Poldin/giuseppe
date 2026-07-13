"use client";

import { useMemo } from "react";
import type {
  ProdottoRiga,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function renderRigaPrezzoCell(riga: ProdottoRiga) {
  if (riga.prezzo_riga == null || !riga.offerta) {
    return <span className="text-zinc-400">—</span>;
  }

  if (riga.quantita != null && riga.quantita > 1) {
    return (
      <div className="inline-flex flex-wrap items-center justify-end gap-2">
        <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {riga.quantita}
        </span>
        <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
          × {formatPrice(riga.offerta.prezzo)} ={" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {formatPrice(riga.prezzo_riga)}
          </span>
        </span>
      </div>
    );
  }

  return formatPrice(riga.prezzo_riga);
}

const medalEmoji = ["🥇", "🥈", "🥉"] as const;

export function ConfrontoEcommerceTable({
  tabelle,
  onNavigateToReferenza,
}: {
  tabelle: TabellaEcommerce[];
  onNavigateToReferenza?: (queryIndex: number) => void;
}) {
  const referenze = tabelle[0]?.righe ?? [];

  const rigaByEcommerce = useMemo(() => {
    const map = new Map<string, Map<number, ProdottoRiga>>();

    for (const tabella of tabelle) {
      const righeByIndex = new Map<number, ProdottoRiga>();
      for (const riga of tabella.righe) {
        righeByIndex.set(riga.query_index, riga);
      }
      map.set(tabella.ecommerce_id, righeByIndex);
    }

    return map;
  }, [tabelle]);

  return (
    <section
      id="confronto-ecommerce"
      tabIndex={-1}
      className="scroll-mt-24 flex min-w-0 flex-col gap-6 outline-none"
    >
      <div>
        <h2 className="text-xl font-black uppercase tracking-tighter">
          Confronto per fornitore
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          scopri chi offre di più.
        </p>
      </div>

      {tabelle.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nessuna selezione attiva. Seleziona almeno un prodotto per referenza.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full w-max text-sm [&_td]:whitespace-normal [&_th]:whitespace-normal">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/70">
                <th className="sticky left-0 z-20 min-w-[9rem] border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-left align-bottom font-semibold sm:min-w-[11rem] sm:px-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                  Richiesto
                </th>
                {tabelle.map((tabella, index) => (
                  <th
                    key={tabella.ecommerce_id}
                    id={`ecommerce-col-${tabella.ecommerce_id}`}
                    tabIndex={-1}
                    className="min-w-[10.5rem] scroll-mt-24 border-r border-zinc-200 px-3 py-3 text-left align-bottom last:border-r-0 sm:min-w-[12rem] sm:px-4 dark:border-zinc-800"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {index < 3 ? (
                          <span
                            className="shrink-0 text-base leading-none"
                            aria-hidden="true"
                          >
                            {medalEmoji[index]}
                          </span>
                        ) : null}
                        <div className="inline-flex h-6 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                          {tabella.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tabella.logo_url}
                              alt={tabella.ecommerce_name}
                              className="h-full w-auto max-w-28 object-contain object-left"
                            />
                          ) : (
                            <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
                              {tabella.ecommerce_name.slice(0, 2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-base font-bold tabular-nums sm:text-lg">
                          {formatPrice(tabella.prezzo_totale)}
                        </p>
                        <p className="text-[11px] leading-snug text-zinc-500 sm:text-xs">
                          {tabella.copertura}/{tabella.copertura_totale} ·
                          prodotti {formatPrice(tabella.prezzo_prodotti)} ·
                          sped. {formatPrice(tabella.prezzo_spedizione)}
                        </p>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {referenze.map((referenza) => (
                <tr key={referenza.query_index}>
                  <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-3 py-2 align-top font-medium break-words sm:px-5 sm:py-3 dark:border-zinc-900 dark:bg-zinc-950">
                    {onNavigateToReferenza ? (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigateToReferenza(referenza.query_index)
                        }
                        className="text-left break-words transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        {referenza.query_text}
                      </button>
                    ) : (
                      referenza.query_text
                    )}
                  </td>
                  {tabelle.map((tabella) => {
                    const riga =
                      rigaByEcommerce
                        .get(tabella.ecommerce_id)
                        ?.get(referenza.query_index) ?? null;
                    const missing =
                      !riga?.trovato || riga.disponibile === false;

                    return (
                      <td
                        key={`${tabella.ecommerce_id}-${referenza.query_index}`}
                        className={`border-r border-zinc-100 px-3 py-2 align-top last:border-r-0 sm:px-4 sm:py-3 dark:border-zinc-900 ${
                          missing
                            ? "bg-amber-50/50 dark:bg-amber-950/20"
                            : ""
                        }`}
                      >
                        <div className="flex min-h-full flex-col gap-1">
                          <p className="break-words text-zinc-800 dark:text-zinc-200">
                            {riga?.trovato && riga.offerta ? (
                              riga.offerta.product_name
                            ) : (
                              <span className="text-amber-700 dark:text-amber-400">
                                Non selezionato
                              </span>
                            )}
                          </p>
                          <div className="text-right tabular-nums">
                            {riga ? renderRigaPrezzoCell(riga) : "—"}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
