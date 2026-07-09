"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TopMatchPerReferenzaSection } from "@/app/components/chat/TopMatchPerReferenzaSection";

import {

  buildInitialCardState,

  buildSelezioneFromState,

  catalogFromConfronto,

  mergeCardStateWithSaved,

  mergeCardStateAfterInsert,
  removeCardStateForReferenza,
  sanitizeCardStateForSave,
  toggleCardSelected,

  type CardMeta,

  type CardStateMap,

} from "@/app/lib/search/card-selection-state";

import { elaboraConfrontoUtente } from "@/app/lib/search/elabora-confronto-utente";
import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";
import {
  buildShippingTiersMap,
  calcolaSpedizione,
  type ShippingTier,
} from "@/app/lib/search/shipping-cost";
import type { EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";

import type {

  RisultatoConfronto,

  RigaTopMatch,

  ScenarioCarrello,

  TabellaEcommerce,

} from "@/app/lib/search/elabora-scenari";



function formatPrice(value: number): string {

  return new Intl.NumberFormat("it-IT", {

    style: "currency",

    currency: "EUR",

  }).format(value);

}



function hasProductDiscount(offerta: { discount?: number | null }): boolean {

  return offerta.discount != null && offerta.discount > 0;

}



function DiscountedPrice({

  amount,

  offerta,

  className,

}: {

  amount: number;

  offerta: { discount?: number | null };

  className?: string;

}) {

  return (

    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>

      {formatPrice(amount)}

      {hasProductDiscount(offerta) ? (

        <span aria-label="Prezzo scontato">⬇️</span>

      ) : null}

    </span>

  );

}



function ScenarioProductBadge({

  productName,

  url,

}: {

  productName: string;

  url: string | null;

}) {

  const className =

    "inline-flex max-w-full items-center rounded-md bg-white px-2 py-1 text-xs font-medium leading-snug text-zinc-700 transition-colors  dark:bg-zinc-900 dark:text-zinc-200";



  if (url) {

    return (

      <a

        href={url}

        target="_blank"

        rel="noopener noreferrer"

        className={`${className} hover:bg-zinc-50 dark:hover:bg-zinc-800`}

      >

        <span className="truncate">{productName}</span>

      </a>

    );

  }



  return (

    <span className={className}>

      <span className="truncate">{productName}</span>

    </span>

  );

}



function formatScenarioSummary(
  copertura: number,
  coperturaTotale: number,
  prezzoProdotti: number,
  prezzoSpedizione: number
): string {
  const spedizioneLabel =
    prezzoSpedizione > 0
      ? ` · spedizione ${formatPrice(prezzoSpedizione)}`
      : " · spedizione 0 €";

  return `${copertura}/${coperturaTotale} referenze · prodotti ${formatPrice(prezzoProdotti)}${spedizioneLabel}`;
}



function ScenarioCard({

  scenario,

  catalogById,

  tiersByEcommerce,

}: {

  scenario: ScenarioCarrello;

  catalogById: Record<string, TabellaEcommerce>;

  tiersByEcommerce: Record<string, ShippingTier[]>;

}) {

  return (

    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">

      <header className="flex flex-wrap items-start justify-between gap-3 bg-zinc-900 px-4 py-3 sm:px-5 sm:py-4 dark:bg-zinc-950">

        <div className="min-w-0">

          <h3 className="text-lg font-bold text-white">{scenario.titolo}</h3>

          <p className="mt-1 text-xs text-zinc-400">
            {formatScenarioSummary(
              scenario.copertura,
              scenario.copertura_totale,
              scenario.prezzo_prodotti,
              scenario.prezzo_spedizione
            )}
          </p>

        </div>

        <p className="shrink-0 text-2xl font-bold tabular-nums tracking-tight text-white">

          {formatPrice(scenario.prezzo_totale)}

        </p>

      </header>



      <div className="p-4 sm:p-5">

        {Object.entries(scenario.ordini).map(([ecomId, voci]) => {

          const ecom = catalogById[ecomId];

          const prezzoProdottiEcom = voci.reduce(

            (sum, voce) => sum + voce.prezzo_riga,

            0

          );

          const prezzoSpedizioneEcom = calcolaSpedizione(
            prezzoProdottiEcom,
            tiersByEcommerce[ecomId] ?? []
          );

          const totaleParziale = prezzoProdottiEcom + prezzoSpedizioneEcom;

          return (

            <div key={ecomId} className="mb-4 last:mb-0">

              <div className="mb-1 flex items-start justify-between gap-3">

                <div className="inline-flex h-5 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">

                  {ecom?.logo_url ? (

                    // eslint-disable-next-line @next/next/no-img-element

                    <img

                      src={ecom.logo_url}

                      alt={ecom.ecommerce_name}

                      className="h-full w-auto max-w-28 object-contain object-left"

                    />

                  ) : (

                    <span className="text-xs font-bold uppercase text-zinc-600">

                      {(ecom?.ecommerce_name ?? ecomId).slice(0, 2)}

                    </span>

                  )}

                </div>

                <p className="shrink-0 text-lg font-bold tabular-nums tracking-tight">

                  {formatPrice(totaleParziale)}

                </p>

              </div>

              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                {formatScenarioSummary(
                  voci.length,
                  scenario.copertura_totale,
                  prezzoProdottiEcom,
                  prezzoSpedizioneEcom
                )}
              </p>

              <ul className="space-y-1 text-sm">

                {voci.map((voce) => (

                  <li key={voce.offerta.id} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">

                    <div className="min-w-0 flex-1">

                      <ScenarioProductBadge

                        productName={voce.offerta.product_name}

                        url={voce.offerta.original_url?.trim() || null}

                      />

                    </div>

                    <span className="shrink-0 text-zinc-600 sm:text-right dark:text-zinc-400">

                      {voce.quantita > 1 ? (

                        <span className="inline-flex items-center gap-2">

                          <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">

                            {voce.quantita}

                          </span>

                          <span className="text-sm tabular-nums">

                            × {formatPrice(voce.offerta.prezzo)} ={" "}

                            <DiscountedPrice

                              amount={voce.prezzo_riga}

                              offerta={voce.offerta}

                              className="font-semibold text-zinc-900 dark:text-zinc-100"

                            />

                          </span>

                        </span>

                      ) : (

                        <DiscountedPrice

                          amount={voce.prezzo_riga}

                          offerta={voce.offerta}

                        />

                      )}

                    </span>

                  </li>

                ))}

              </ul>

            </div>

          );

        })}





      </div>

    </div>

  );

}



function EcommerceTablesSection({

  tabelle,

}: {

  tabelle: TabellaEcommerce[];

}) {

  return (

    <section className="flex min-w-0 flex-col gap-6">

      <div>

        <h2 className="text-xl font-black uppercase tracking-tighter">

          Confronto per e-commerce

        </h2>

        <p className="text-sm text-zinc-600 dark:text-zinc-400">

          Basato sulle tue selezioni. Classifica: copertura, poi costo totale

          (prodotti + spedizione).

        </p>

      </div>



      {tabelle.length === 0 ? (

        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">

          Nessuna selezione attiva. Seleziona almeno un prodotto per referenza.

        </p>

      ) : null}



      {tabelle.map((tabella, index) => (

        <article

          key={tabella.ecommerce_id}

          className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"

        >

          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5 sm:py-4 dark:border-zinc-800 dark:bg-zinc-900/70">

            <div className="flex items-center gap-3">

              {index === 0 ? (

                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">

                  Migliore

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

            <div className="text-right">

              <p className="text-lg font-bold">

                {formatPrice(tabella.prezzo_totale)}

              </p>

              <p className="text-xs text-zinc-500">

                {tabella.copertura}/{tabella.copertura_totale} · prodotti{" "}

                {formatPrice(tabella.prezzo_prodotti)} · sped.{" "}

                {formatPrice(tabella.prezzo_spedizione)}

              </p>

            </div>

          </header>



          <div className="overflow-x-auto">

            <table className="min-w-full text-sm">

              <thead>

                <tr className="border-b border-zinc-100 dark:border-zinc-900">

                  <th className="px-3 py-2 text-left font-semibold sm:px-5 sm:py-3">Richiesto</th>

                  <th className="px-3 py-2 text-left font-semibold sm:px-5 sm:py-3">Selezionato</th>

                  <th className="px-3 py-2 text-right font-semibold sm:px-5 sm:py-3">Totale</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">

                {tabella.righe.map((riga) => (

                  <tr

                    key={`${tabella.ecommerce_id}-${riga.query_index}`}

                    className={

                      riga.trovato && riga.disponibile !== false

                        ? undefined

                        : "bg-amber-50/50 dark:bg-amber-950/20"

                    }

                  >

                    <td className="px-3 py-2 align-top font-medium sm:px-5 sm:py-3">

                      {riga.query_text}

                    </td>

                    <td className="px-3 py-2 align-top sm:px-5 sm:py-3">

                      {riga.trovato && riga.offerta ? (

                        riga.offerta.product_name

                      ) : (

                        <span className="text-amber-700 dark:text-amber-400">

                          Non selezionato

                        </span>

                      )}

                    </td>

                    <td className="px-3 py-2 align-top text-right sm:px-5 sm:py-3">

                      {riga.prezzo_riga != null && riga.offerta ? (

                        riga.quantita != null && riga.quantita > 1 ? (

                          <div className="inline-flex items-center justify-end gap-2">

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

                        ) : (

                          formatPrice(riga.prezzo_riga)

                        )

                      ) : (

                        "—"

                      )}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </article>

      ))}

    </section>

  );

}



export function ChatConfrontoClient({

  chatId,

  confronto: initialConfronto,

}: {

  chatId: string;

  confronto: RisultatoConfronto;

}) {

  const [confronto, setConfronto] = useState(initialConfronto);

  const initial = useMemo(() => {

    const built = buildInitialCardState(initialConfronto);

    return {

      cards: built.cards,

      state: mergeCardStateWithSaved(

        built.cards,

        built.state,

        initialConfronto.user_card_state

      ),

    };

  }, [initialConfronto]);

  const [cards, setCards] = useState<CardMeta[]>(initial.cards);

  const [cardState, setCardState] = useState<CardStateMap>(initial.state);

  const saveEnabledRef = useRef(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAddingReferenza, setIsAddingReferenza] = useState(false);

  const [addReferenzaError, setAddReferenzaError] = useState<string | null>(null);

  const [isRemovingReferenza, setIsRemovingReferenza] = useState(false);

  const [removeReferenzaError, setRemoveReferenzaError] = useState<string | null>(null);

  const [catalogoEcommerce, setCatalogoEcommerce] = useState<EcommerceInfo[]>(() =>
    catalogFromConfronto(confronto)
  );

  useEffect(() => {
    const hasShippingTiers = catalogoEcommerce.some(
      (ecom) => (ecom.shipping_tiers?.length ?? 0) > 0
    );

    if (hasShippingTiers) {
      return;
    }

    void fetchEcommerceCatalog()
      .then(setCatalogoEcommerce)
      .catch((error) => {
        console.error("Caricamento regole spedizione fallito:", error);
      });
  }, [catalogoEcommerce]);

  const calcolo = useMemo(() => {

    const selezioni = buildSelezioneFromState(cards, cardState);

    return elaboraConfrontoUtente({

      prodottiRichiesti: confronto.prodotti_richiesti,

      selezioni,

      catalogoEcommerce,

    });

  }, [cards, cardState, confronto, catalogoEcommerce]);



  const catalogById = Object.fromEntries(

    calcolo.tabelle_ecommerce.map((t) => [t.ecommerce_id, t])

  );

  const tiersByEcommerce = useMemo(
    () => buildShippingTiersMap(catalogoEcommerce),
    [catalogoEcommerce]
  );



  useEffect(() => {

    const enableTimer = window.setTimeout(() => {

      saveEnabledRef.current = true;

    }, 0);



    return () => {

      window.clearTimeout(enableTimer);

    };

  }, []);



  useEffect(() => {

    if (!saveEnabledRef.current) {

      return;

    }



    if (saveTimerRef.current) {

      clearTimeout(saveTimerRef.current);

    }



    saveTimerRef.current = setTimeout(() => {

      const payload = sanitizeCardStateForSave(cardState, cards);



      void fetch(`/api/chat/${chatId}/selections`, {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ cardState: payload }),

      }).catch((error) => {

        console.error("Salvataggio selezioni fallito:", error);

      });

    }, 500);



    return () => {

      if (saveTimerRef.current) {

        clearTimeout(saveTimerRef.current);

      }

    };

  }, [cardState, cards, chatId]);



  const handleAddReferenza = useCallback(

    async (insertAfterIndex: number, productName: string) => {

      setIsAddingReferenza(true);

      setAddReferenzaError(null);



      try {

        const response = await fetch(`/api/chat/${chatId}/add-referenza`, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ insertAfterIndex, productName }),

        });



        const payload = (await response.json()) as {

          confronto?: RisultatoConfronto;

          newRow?: RigaTopMatch;

          error?: string;

        };



        if (!response.ok || !payload.confronto || !payload.newRow) {

          throw new Error(payload.error ?? "Errore durante l'aggiunta");

        }



        setConfronto(payload.confronto);



        const merged = mergeCardStateAfterInsert(

          cards,

          cardState,

          insertAfterIndex,

          payload.newRow

        );

        setCards(merged.cards);

        setCardState(merged.state);

      } catch (error) {

        setAddReferenzaError(

          error instanceof Error ? error.message : "Errore durante l'aggiunta"

        );

      } finally {

        setIsAddingReferenza(false);

      }

    },

    [cardState, cards, chatId]

  );



  const risparmioAssolutoRef = useRef<HTMLDivElement>(null);

  const scrollToRisparmioAssoluto = useCallback(() => {
    const element = risparmioAssolutoRef.current;
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    element.focus({ preventScroll: true });
  }, []);

  const handleRemoveReferenza = useCallback(

    async (queryIndex: number) => {

      setIsRemovingReferenza(true);

      setRemoveReferenzaError(null);



      try {

        const response = await fetch(`/api/chat/${chatId}/remove-referenza`, {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ queryIndex }),

        });



        const payload = (await response.json()) as {

          confronto?: RisultatoConfronto;

          queryIndex?: number;

          error?: string;

        };



        if (!response.ok || !payload.confronto || payload.queryIndex == null) {

          throw new Error(payload.error ?? "Errore durante l'eliminazione");

        }



        setConfronto(payload.confronto);



        const updated = removeCardStateForReferenza(

          cards,

          cardState,

          payload.queryIndex

        );

        setCards(updated.cards);

        setCardState(updated.state);

      } catch (error) {

        setRemoveReferenzaError(

          error instanceof Error

            ? error.message

            : "Errore durante l'eliminazione"

        );

      } finally {

        setIsRemovingReferenza(false);

      }

    },

    [cardState, cards, chatId]

  );



  return (

    <div className="flex w-full min-w-0 flex-col gap-8 sm:gap-10">

      <button
        type="button"
        onClick={scrollToRisparmioAssoluto}
        className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm transition-transform hover:scale-[1.02] active:scale-[0.98] sm:top-4 sm:right-4 sm:gap-2 sm:px-4 sm:py-3 dark:border-zinc-700 dark:bg-zinc-900/95"
        aria-label={`Risparmio assoluto: ${formatPrice(calcolo.scenario_risparmio.prezzo_totale)}. Vai alla sezione.`}
      >
        <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
          💸
        </span>
        <span className="text-base font-bold tabular-nums tracking-tight sm:text-xl">
          {formatPrice(calcolo.scenario_risparmio.prezzo_totale)}
        </span>
      </button>

      <TopMatchPerReferenzaSection

        confronto={confronto}

        cardState={cardState}

        onCardStateChange={setCardState}

        onToggleSelected={(cardKey) => {

          const card = cards.find((item) => item.key === cardKey);

          if (!card) return;

          setCardState((current) => toggleCardSelected(current, card, cards));

        }}

        onAddReferenza={(insertAfterIndex, productName) => {

          void handleAddReferenza(insertAfterIndex, productName);

        }}

        isAddingReferenza={isAddingReferenza}

        addReferenzaError={addReferenzaError}

        onRemoveReferenza={(queryIndex) => {

          void handleRemoveReferenza(queryIndex);

        }}

        isRemovingReferenza={isRemovingReferenza}

        removeReferenzaError={removeReferenzaError}

      />

      <section className="grid min-w-0 gap-4 md:grid-cols-2">

        <div
          ref={risparmioAssolutoRef}
          id="scenario-risparmio-assoluto"
          tabIndex={-1}
          className="scroll-mt-24 outline-none"
        >
          <ScenarioCard
            scenario={calcolo.scenario_risparmio}
            catalogById={catalogById}
            tiersByEcommerce={tiersByEcommerce}
          />
        </div>

        <ScenarioCard

          scenario={calcolo.scenario_monopolista}

          catalogById={catalogById}

          tiersByEcommerce={tiersByEcommerce}

        />

      </section>

      <EcommerceTablesSection tabelle={calcolo.tabelle_ecommerce} />

    </div>

  );

}


