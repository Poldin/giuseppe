"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowUpRight } from "lucide-react";

import { TopMatchPerReferenzaSection } from "@/app/components/chat/TopMatchPerReferenzaSection";
import { ConfrontoEcommerceTable } from "@/app/components/chat/ConfrontoEcommerceTable";
import { QuantityControl } from "@/app/components/chat/QuantityControl";

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
  buildShippingHints,
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

  brand,

  url,

  quantita,

  onNavigateToReferenza,

  onQuantityChange,

}: {

  productName: string;

  brand?: string | null;

  url: string | null;

  quantita: number;

  onNavigateToReferenza?: () => void;

  onQuantityChange?: (next: number) => void;

}) {

  return (

    <div className="min-w-0 space-y-1.5">

      {onNavigateToReferenza ? (

        <button

          type="button"

          onClick={onNavigateToReferenza}

          className="inline-block w-fit max-w-full rounded-md bg-white px-2 py-1 text-left text-md font-medium leading-snug break-words text-zinc-700 transition-colors hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100"

        >

          {productName}

        </button>

      ) : (

        <span className="inline-block w-fit max-w-full rounded-md bg-white px-2 py-1 text-xs font-medium leading-snug break-words text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">

          {productName}

        </span>

      )}

      <div className="flex flex-wrap items-center gap-1.5">

        {brand ? (

          <span className="inline-flex shrink-0 items-center px-2 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">

            {brand}

          </span>

        ) : null}

        {url ? (

          <a

            href={url}

            target="_blank"

            rel="noopener noreferrer"

            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-light text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"

            aria-label={`Apri ${productName} sul sito del negozio`}

          >

            vedi

            <ArrowUpRight className="h-3.5 w-3.5" />

          </a>

        ) : null}

        {onQuantityChange ? (

          <QuantityControl

            quantity={quantita}

            onQuantityChange={onQuantityChange}

            compact

          />

        ) : null}

      </div>

    </div>

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

  queryIndexByOffertaId,

  onNavigateToReferenza,

  onQuantityChange,

}: {

  scenario: ScenarioCarrello;

  catalogById: Record<string, TabellaEcommerce>;

  tiersByEcommerce: Record<string, ShippingTier[]>;

  queryIndexByOffertaId: Map<string, number>;

  onNavigateToReferenza?: (queryIndex: number) => void;

  onQuantityChange?: (input: {

    queryIndex: number;

    ecommerceId: string;

    offertaId: string;

    next: number;

  }) => void;

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

          const shippingHints = buildShippingHints(
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

              {shippingHints.length > 0 ? (
                <div className="mb-2 flex flex-col items-start gap-1.5">
                  {shippingHints.map((hint) => (
                    <span
                      key={`${hint.targetShipping}-${hint.gap}`}
                      className="inline-flex max-w-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium leading-snug text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      ancora {formatPrice(hint.gap)} per {" "}
                      {formatPrice(hint.targetShipping)} di spedizione
                    </span>
                  ))}
                </div>
              ) : null}

              <ul className="space-y-2">

                {voci.map((voce) => (

                  <li

                    key={voce.offerta.id}

                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4"

                  >

                    <ScenarioProductBadge

                        productName={voce.offerta.product_name}

                        brand={voce.offerta.brand}

                        url={voce.offerta.original_url?.trim() || null}

                        quantita={voce.quantita}

                        onNavigateToReferenza={

                          onNavigateToReferenza

                            ? () => {

                                const queryIndex = queryIndexByOffertaId.get(

                                  voce.offerta.id

                                );

                                if (queryIndex != null) {

                                  onNavigateToReferenza(queryIndex);

                                }

                              }

                            : undefined

                        }

                        onQuantityChange={

                          onQuantityChange

                            ? (next) => {

                                const queryIndex = queryIndexByOffertaId.get(

                                  voce.offerta.id

                                );

                                if (queryIndex == null) {

                                  return;

                                }

                                onQuantityChange({

                                  queryIndex,

                                  ecommerceId: ecomId,

                                  offertaId: voce.offerta.id,

                                  next,

                                });

                              }

                            : undefined

                        }

                    />

                    <div className="shrink-0 text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">

                      {voce.quantita > 1 ? (

                        <span className="whitespace-nowrap">

                          × {formatPrice(voce.offerta.prezzo)} ={" "}

                          <DiscountedPrice

                            amount={voce.prezzo_riga}

                            offerta={voce.offerta}

                            className="font-semibold text-zinc-900 dark:text-zinc-100"

                          />

                        </span>

                      ) : (

                        <DiscountedPrice

                          amount={voce.prezzo_riga}

                          offerta={voce.offerta}

                        />

                      )}

                    </div>

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



function EcommerceRankingCard({

  tabelle,

  onNavigateToEcommerceTable,

  onExploreAll,

}: {

  tabelle: TabellaEcommerce[];

  onNavigateToEcommerceTable?: (ecommerceId: string) => void;

  onExploreAll?: () => void;

}) {

  const medalEmoji = ["🥇", "🥈", "🥉"] as const;

  const topTabelle = tabelle.slice(0, 3);

  return (

    <div className="overflow-hidden rounded-2xl">

      <header className="px-3 py-2.5 sm:px-4 sm:py-3">

        <h3 className="text-base font-bold sm:text-lg">

          Classifica fornitori

        </h3>

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

                <span className="shrink-0 text-base leading-none" aria-hidden="true">

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

                onClick={() => onNavigateToEcommerceTable?.(tabella.ecommerce_id)}

                className="mt-2.5 w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"

                aria-label={`Esplora il confronto ${tabella.ecommerce_name}`}

              >

                esplora

              </button>

            </li>

          ))}

          {onExploreAll ? (

            <li>

              <button

                type="button"

                onClick={onExploreAll}

                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"

                aria-label="Esplora tutti gli e-commerce in fondo alla pagina"

              >

                esplora tutti

              </button>

            </li>

          ) : null}

        </ul>

      )}

    </div>

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

  const scrollToReferenzaRef = useRef<(queryIndex: number) => void>(() => {});

  const queryIndexByOffertaId = useMemo(() => {

    const map = new Map<string, number>();

    for (const card of cards) {

      map.set(card.offerta.id, card.queryIndex);

    }

    return map;

  }, [cards]);

  const scrollToRisparmioAssoluto = useCallback(() => {
    const element = risparmioAssolutoRef.current;
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    element.focus({ preventScroll: true });
  }, []);

  const scrollToReferenza = useCallback((queryIndex: number) => {

    scrollToReferenzaRef.current(queryIndex);

  }, []);

  const handleScenarioQuantityChange = useCallback(

    (input: {

      queryIndex: number;

      ecommerceId: string;

      offertaId: string;

      next: number;

    }) => {

      const cardKey = `${input.queryIndex}-${input.ecommerceId}-${input.offertaId}`;

      setCardState((current) => {

        const ui = current[cardKey] ?? {

          hidden: false,

          selected: true,

          quantity: 1,

        };

        return {

          ...current,

          [cardKey]: {

            ...ui,

            quantity: Math.max(1, input.next),

          },

        };

      });

    },

    []

  );

  const scrollToEcommerceTable = useCallback((ecommerceId: string) => {

    window.requestAnimationFrame(() => {

      const element = document.getElementById(

        `ecommerce-col-${ecommerceId}`

      );

      if (!element) {

        return;

      }

      element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

      element.focus({ preventScroll: true });

    });

  }, []);

  const scrollToAllEcommerce = useCallback(() => {

    const element = document.getElementById("confronto-ecommerce");

    if (!element) {

      return;

    }

    element.scrollIntoView({ behavior: "smooth", block: "start" });

    element.focus({ preventScroll: true });

  }, []);

  const handleRegisterScrollToReferenza = useCallback(

    (fn: (queryIndex: number) => void) => {

      scrollToReferenzaRef.current = fn;

    },

    []

  );

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

      <section className="grid min-w-0 gap-4 md:grid-cols-10">

        <div
          ref={risparmioAssolutoRef}
          id="scenario-risparmio-assoluto"
          tabIndex={-1}
          className="scroll-mt-24 outline-none md:col-span-7"
        >
          <ScenarioCard

            scenario={calcolo.scenario_risparmio}

            catalogById={catalogById}

            tiersByEcommerce={tiersByEcommerce}

            queryIndexByOffertaId={queryIndexByOffertaId}

            onNavigateToReferenza={scrollToReferenza}

            onQuantityChange={handleScenarioQuantityChange}

          />

        </div>

        <div className="min-w-0 md:col-span-3">

          <EcommerceRankingCard

            tabelle={calcolo.tabelle_ecommerce}

            onNavigateToEcommerceTable={scrollToEcommerceTable}

            onExploreAll={scrollToAllEcommerce}

          />

        </div>

      </section>

      <TopMatchPerReferenzaSection

        confronto={confronto}

        cardState={cardState}

        onCardStateChange={setCardState}

        onRegisterScrollToReferenza={handleRegisterScrollToReferenza}

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

      <ConfrontoEcommerceTable

        tabelle={calcolo.tabelle_ecommerce}

        onNavigateToReferenza={scrollToReferenza}

      />

    </div>

  );

}


