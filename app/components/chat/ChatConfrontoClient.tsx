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
  parseCardKey,
  removeCardStateForReferenza,
  sanitizeCardStateForSave,
  toggleCardSelected,
  type CardMeta,
  type CardStateMap,
} from "@/app/lib/search/card-selection-state";
import {
  assignmentsFromScenario,
  buildPendingFingerprint,
  buildScenarioFromAssignments,
  computePendingChanges,
  filterCommittedAssignments,
  parseCommittedScenarioPayload,
  removeCommittedAssignment,
  removeCommittedForReferenza,
  replaceCommittedWithOptimal,
  sanitizeCommittedScenarioForSave,
  shiftCommittedAfterInsert,
  updateCommittedQuantity,
  upsertCommittedAssignment,
} from "@/app/lib/search/committed-scenario";
import { elaboraConfrontoUtente } from "@/app/lib/search/elabora-confronto-utente";
import type { CommittedAssignment, EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";
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

function buildQueryIndexByOffertaId(cards: CardMeta[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of cards) {
    map.set(card.offerta.id, card.queryIndex);
  }
  return map;
}

function buildValidOfferIds(cards: CardMeta[]): Set<string> {
  return new Set(cards.map((card) => card.offerta.id));
}

function resolveInitialCommittedAssignments(input: {
  confronto: RisultatoConfronto;
  cards: CardMeta[];
  cardState: CardStateMap;
  catalogoEcommerce: EcommerceInfo[];
}): CommittedAssignment[] {
  const queryIndexByOffertaId = buildQueryIndexByOffertaId(input.cards);
  const validOfferIds = buildValidOfferIds(input.cards);
  const maxQueryIndex = input.confronto.prodotti_richiesti.length - 1;
  const saved = parseCommittedScenarioPayload(
    input.confronto.user_committed_scenario
  );

  if (saved) {
    const filtered = filterCommittedAssignments(
      saved,
      validOfferIds,
      maxQueryIndex
    );
    if (filtered.length > 0) {
      return filtered;
    }
  }

  const selezioni = buildSelezioneFromState(input.cards, input.cardState);
  const calcolo = elaboraConfrontoUtente({
    prodottiRichiesti: input.confronto.prodotti_richiesti,
    selezioni,
    catalogoEcommerce: input.catalogoEcommerce,
  });

  return assignmentsFromScenario(
    calcolo.scenario_risparmio,
    queryIndexByOffertaId
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
  const [catalogoEcommerce, setCatalogoEcommerce] = useState<EcommerceInfo[]>(
    () => catalogFromConfronto(confronto)
  );
  const [committedAssignments, setCommittedAssignments] = useState<
    CommittedAssignment[]
  >(() =>
    resolveInitialCommittedAssignments({
      confronto: initialConfronto,
      cards: initial.cards,
      cardState: initial.state,
      catalogoEcommerce: catalogFromConfronto(initialConfronto),
    })
  );
  const [dismissedPendingFingerprint, setDismissedPendingFingerprint] =
    useState<string | null>(null);

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

  const selezioni = useMemo(
    () => buildSelezioneFromState(cards, cardState),
    [cards, cardState]
  );

  const calcolo = useMemo(() => {
    return elaboraConfrontoUtente({
      prodottiRichiesti: confronto.prodotti_richiesti,
      selezioni,
      catalogoEcommerce,
    });
  }, [selezioni, confronto, catalogoEcommerce]);

  const queryIndexByOffertaId = useMemo(
    () => buildQueryIndexByOffertaId(cards),
    [cards]
  );

  const committedScenario = useMemo(
    () =>
      buildScenarioFromAssignments(committedAssignments, {
        prodottiRichiesti: confronto.prodotti_richiesti,
        selezioni,
        catalogoEcommerce,
      }),
    [
      committedAssignments,
      confronto.prodotti_richiesti,
      selezioni,
      catalogoEcommerce,
    ]
  );

  const pending = useMemo(
    () =>
      computePendingChanges({
        committedAssignments,
        committedScenario,
        optimalScenario: calcolo.scenario_risparmio,
        prodottiRichiesti: confronto.prodotti_richiesti,
        catalogoEcommerce,
        queryIndexByOffertaId,
      }),
    [
      committedAssignments,
      committedScenario,
      calcolo.scenario_risparmio,
      confronto.prodotti_richiesti,
      catalogoEcommerce,
      queryIndexByOffertaId,
    ]
  );

  const pendingFingerprint = useMemo(
    () => buildPendingFingerprint(pending.changes, pending.summary.savingsDelta),
    [pending.changes, pending.summary.savingsDelta]
  );

  const showPendingOptimization =
    pending.changes.length > 0 &&
    pendingFingerprint !== dismissedPendingFingerprint;

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
      const committedPayload = sanitizeCommittedScenarioForSave(
        committedAssignments
      );

      void fetch(`/api/chat/${chatId}/selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardState: payload,
          committedScenario: committedPayload,
        }),
      }).catch((error) => {
        console.error("Salvataggio selezioni fallito:", error);
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [cardState, cards, chatId, committedAssignments]);

  const handleAcceptPending = useCallback(() => {
    setCommittedAssignments(
      replaceCommittedWithOptimal(
        calcolo.scenario_risparmio,
        queryIndexByOffertaId
      )
    );
    setDismissedPendingFingerprint(null);
  }, [calcolo.scenario_risparmio, queryIndexByOffertaId]);

  const handleRejectPending = useCallback(() => {
    setDismissedPendingFingerprint(pendingFingerprint);
  }, [pendingFingerprint]);

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

        const newQueryIndex = insertAfterIndex + 1;
        const shiftedCommitted = shiftCommittedAfterInsert(
          committedAssignments,
          insertAfterIndex
        );
        const nextCards = merged.cards;
        const nextState = merged.state;
        const nextSelezioni = buildSelezioneFromState(nextCards, nextState);
        const nextCalcolo = elaboraConfrontoUtente({
          prodottiRichiesti: payload.confronto.prodotti_richiesti,
          selezioni: nextSelezioni,
          catalogoEcommerce,
        });
        const nextQueryIndexByOffertaId = buildQueryIndexByOffertaId(nextCards);
        const optimalForNewRow = assignmentsFromScenario(
          nextCalcolo.scenario_risparmio,
          nextQueryIndexByOffertaId
        ).find((assignment) => assignment.query_index === newQueryIndex);

        setCommittedAssignments(
          optimalForNewRow
            ? upsertCommittedAssignment(shiftedCommitted, optimalForNewRow)
            : shiftedCommitted
        );
      } catch (error) {
        setAddReferenzaError(
          error instanceof Error ? error.message : "Errore durante l'aggiunta"
        );
      } finally {
        setIsAddingReferenza(false);
      }
    },
    [cardState, cards, chatId, catalogoEcommerce, committedAssignments]
  );

  const risparmioAssolutoRef = useRef<HTMLDivElement>(null);
  const scrollToReferenzaRef = useRef<(queryIndex: number) => void>(() => {});
  const openAddReferenzaRef = useRef<() => void>(() => {});

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
      setCommittedAssignments((current) =>
        updateCommittedQuantity(current, input.queryIndex, input.next)
      );
    },
    []
  );

  const handleTopMatchQuantityChange = useCallback(
    (key: string, next: number) => {
      const parsed = parseCardKey(key);
      if (!parsed) {
        return;
      }

      setCardState((current) => {
        const ui = current[key] ?? {
          hidden: false,
          selected: false,
          quantity: 1,
        };
        return {
          ...current,
          [key]: {
            ...ui,
            quantity: Math.max(1, next),
          },
        };
      });

      setCommittedAssignments((current) => {
        const assignment = current.find(
          (entry) => entry.query_index === parsed.queryIndex
        );
        if (
          !assignment ||
          assignment.ecommerce_id !== parsed.ecommerceId ||
          assignment.offerta_id !== parsed.offertaId
        ) {
          return current;
        }

        return updateCommittedQuantity(current, parsed.queryIndex, next);
      });
    },
    []
  );

  const handleToggleSelected = useCallback(
    (cardKey: string) => {
      const card = cards.find((item) => item.key === cardKey);
      if (!card) {
        return;
      }

      const nextState = toggleCardSelected(cardState, card, cards);
      setCardState(nextState);

      const nextSelezioni = buildSelezioneFromState(cards, nextState);
      const nextCalcolo = elaboraConfrontoUtente({
        prodottiRichiesti: confronto.prodotti_richiesti,
        selezioni: nextSelezioni,
        catalogoEcommerce,
      });
      const optimalForRow = assignmentsFromScenario(
        nextCalcolo.scenario_risparmio,
        queryIndexByOffertaId
      ).find((assignment) => assignment.query_index === card.queryIndex);

      setCommittedAssignments((current) => {
        if (optimalForRow) {
          return upsertCommittedAssignment(current, optimalForRow);
        }
        return removeCommittedAssignment(current, card.queryIndex);
      });
    },
    [
      cardState,
      cards,
      catalogoEcommerce,
      confronto.prodotti_richiesti,
      queryIndexByOffertaId,
    ]
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

  const handleRegisterOpenAddReferenza = useCallback((fn: () => void) => {
    openAddReferenzaRef.current = fn;
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
        setCommittedAssignments((current) =>
          removeCommittedForReferenza(current, payload.queryIndex!)
        );
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
        aria-label={`Risparmio assoluto: ${formatPrice(committedScenario.prezzo_totale)}. Vai alla sezione.`}
      >
        <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
          💸
        </span>
        {showPendingOptimization ? (
          <span className="text-lg leading-none sm:text-xl" aria-hidden="true">
            ⚡
          </span>
        ) : null}
        <span className="text-base font-bold tabular-nums tracking-tight sm:text-xl">
          {formatPrice(committedScenario.prezzo_totale)}
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
            scenario={committedScenario}
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
            onOpenAddReferenza={() => openAddReferenzaRef.current()}
            isAddingReferenza={isAddingReferenza}
            showPendingOptimization={showPendingOptimization}
            pendingChanges={pending.changes}
            pendingSummary={pending.summary}
            onAcceptPending={handleAcceptPending}
            onRejectPending={handleRejectPending}
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
        onCardQuantityChange={handleTopMatchQuantityChange}
        onRegisterScrollToReferenza={handleRegisterScrollToReferenza}
        onRegisterOpenAddReferenza={handleRegisterOpenAddReferenza}
        onToggleSelected={handleToggleSelected}
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
        prezzoTotale={committedScenario.prezzo_totale}
        showPendingOptimization={showPendingOptimization}
      />

      <ConfrontoEcommerceTable
        tabelle={calcolo.tabelle_ecommerce}
        onNavigateToReferenza={scrollToReferenza}
      />
    </div>
  );
}
