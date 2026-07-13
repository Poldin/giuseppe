"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfrontoEcommerceTable } from "@/app/components/chat/ConfrontoEcommerceTable";
import { EcommerceRankingCard } from "@/app/components/chat/EcommerceRankingCard";
import { ScenarioCard } from "@/app/components/chat/ScenarioCard";
import { TopMatchPerReferenzaSection } from "@/app/components/chat/TopMatchPerReferenzaSection";
import {
  buildInitialCardState,
  buildSelezioneFromState,
  catalogFromConfronto,
  mergeCardStateAfterInsert,
  mergeCardStateWithSaved,
  removeCardStateForReferenza,
  sanitizeCardStateForSave,
  toggleCardSelected,
  type CardMeta,
  type CardStateMap,
} from "@/app/lib/search/card-selection-state";
import { elaboraConfrontoUtente } from "@/app/lib/search/elabora-confronto-utente";
import type { EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";
import type {
  RisultatoConfronto,
  RigaTopMatch,
} from "@/app/lib/search/elabora-scenari";
import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";
import { buildShippingTiersMap } from "@/app/lib/search/shipping-cost";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
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
  const [addReferenzaError, setAddReferenzaError] = useState<string | null>(
    null
  );
  const [isRemovingReferenza, setIsRemovingReferenza] = useState(false);
  const [removeReferenzaError, setRemoveReferenzaError] = useState<
    string | null
  >(null);
  const [catalogoEcommerce, setCatalogoEcommerce] = useState<EcommerceInfo[]>(
    () => catalogFromConfronto(confronto)
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
      const element = document.getElementById(`ecommerce-col-${ecommerceId}`);
      if (!element) {
        return;
      }
      element.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
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
            onRemoveReferenza={(queryIndex) => {
              void handleRemoveReferenza(queryIndex);
            }}
            isRemovingReferenza={isRemovingReferenza}
            canRemoveReferenza={confronto.prodotti_richiesti.length > 1}
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
