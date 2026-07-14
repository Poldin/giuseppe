"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";
import { QuantityControl } from "@/app/components/chat/QuantityControl";
import type { CardStateMap } from "@/app/lib/search/card-selection-state";
import type {
  ProdottoOfferta,
  RisultatoConfronto,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari";
type MatchCard = {
  key: string;
  col: TabellaEcommerce;
  candidato: ProdottoOfferta;
};

type EcommerceMatchGroup = {
  ecommerceId: string;
  col: TabellaEcommerce;
  cards: MatchCard[];
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffleIds(ids: string[], seed: string): string[] {
  const copy = [...ids].sort();
  let state = hashString(seed);

  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function orderEcommerceGroups(
  groups: EcommerceMatchGroup[],
  order: string[]
): EcommerceMatchGroup[] {
  const byId = new Map(groups.map((group) => [group.ecommerceId, group]));
  return order
    .map((id) => byId.get(id))
    .filter((group): group is EcommerceMatchGroup => group != null);
}

function formatEuro(value: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatDiscountPercent(
  discount: number | null | undefined
): string | null {
  if (discount == null || discount <= 0) {
    return null;
  }

  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(discount) ? 0 : 1,
  }).format(discount);
}

function MatchCardItem({
  card,
  quantity,
  isSelected,
  hideEcommerceBadge = false,
  onQuantityChange,
  onToggleSelected,
  onAddAsReferenza,
  isAddingReferenza = false,
}: {
  card: MatchCard;
  quantity: number;
  isSelected: boolean;
  hideEcommerceBadge?: boolean;
  onQuantityChange: (next: number) => void;
  onToggleSelected: () => void;
  onAddAsReferenza?: (productName: string) => void;
  isAddingReferenza?: boolean;
}) {
  const { col, candidato } = card;
  const [copied, setCopied] = useState(false);
  const totalPrice = candidato.prezzo * quantity;
  const productUrl = candidato.original_url?.trim() || null;
  const discountPercent = formatDiscountPercent(candidato.discount);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopyName = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(candidato.product_name);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const cardClassName = isSelected
    ? "border-[3px] border-zinc-900 bg-white shadow-md dark:border-zinc-100 dark:bg-zinc-950"
    : "border border-zinc-200/40 bg-white/25 dark:border-zinc-700/35 dark:bg-zinc-950/25";

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) {
      return;
    }
    onToggleSelected();
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onToggleSelected();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-pressed={isSelected}
      aria-label={
        isSelected
          ? `Deseleziona ${candidato.product_name}`
          : `Seleziona ${candidato.product_name}`
      }
      className={`relative flex h-full w-64 shrink-0 flex-col rounded-xl p-4 transition-[opacity,box-shadow,border-color] sm:w-72 ${
        isSelected
          ? "cursor-pointer hover:shadow-sm"
          : "cursor-pointer opacity-75 hover:opacity-90 hover:shadow-sm"
      } ${cardClassName}`}
    >
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSelected}
          className={`rounded-md p-2 transition-colors sm:p-1.5 ${
            isSelected
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          }`}
          aria-label={isSelected ? "Deseleziona prodotto" : "Seleziona prodotto"}
          aria-pressed={isSelected}
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 pr-8">

        {!hideEcommerceBadge ? (
          <div className="inline-flex h-5 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
            {col.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={col.logo_url}
                alt={col.ecommerce_name}
                className="h-full w-auto max-w-28 object-contain object-left"
              />
            ) : (
              <span className="text-xs font-bold uppercase text-zinc-600">
                {col.ecommerce_name.slice(0, 2)}
              </span>
            )}
          </div>
        ) : null}

        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-light text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            vedi
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}

        {onAddAsReferenza && !isSelected ? (
          <button
            type="button"
            onClick={() => onAddAsReferenza(candidato.product_name)}
            disabled={isAddingReferenza}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-light text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {isAddingReferenza ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            aggiungi 🔎
          </button>
        ) : null}
      </div>

      <div className="min-h-12 flex flex-1 flex-col gap-1">
        <div className="flex items-start gap-1.5 text-sm leading-snug">
          <span className="min-w-0 flex-1">{candidato.product_name}</span>
        </div>
        {candidato.brand ? (
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {candidato.brand}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col items-start gap-1 sm:order-2 sm:items-end">
          {discountPercent ? (
            <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              ⬇️-{discountPercent}% sconto
            </span>
          ) : null}
          <div className="flex items-baseline gap-2">
            {quantity > 1 ? (
              <span className="text-sm tabular-nums text-zinc-500">
                {formatEuro(candidato.prezzo)}
              </span>
            ) : null}
            <span className="text-lg font-bold tabular-nums tracking-tight">
              {formatEuro(totalPrice)}
            </span>
          </div>
        </div>

        <div className="sm:order-1">
          <QuantityControl
            quantity={quantity}
            onQuantityChange={onQuantityChange}
          />
        </div>
      </div>
    </div>
  );
}

function EcommerceMatchStrip({
  group,
  visibleCards,
  cardState,
  onQuantityChange,
  onToggleSelected,
  onAddAsReferenza,
  isAddingReferenza = false,
}: {
  group: EcommerceMatchGroup;
  visibleCards: MatchCard[];
  cardState: CardStateMap;
  onQuantityChange: (key: string, next: number) => void;
  onToggleSelected: (key: string) => void;
  onAddAsReferenza?: (productName: string) => void;
  isAddingReferenza?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const maxScroll = element.scrollWidth - element.clientWidth;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, visibleCards.length]);

  const getScrollStep = (element: HTMLDivElement) => {
    const track = element.firstElementChild;
    if (!track) {
      return 288;
    }

    const cards = track.querySelectorAll<HTMLElement>("[data-strip-card]");
    if (cards.length >= 2) {
      return cards[1].offsetLeft - cards[0].offsetLeft;
    }
    if (cards.length === 1) {
      return cards[0].offsetWidth + 12;
    }
    return 288;
  };

  const scrollStrip = (direction: "left" | "right") => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const amount = getScrollStep(element);
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const handleDragPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragStateRef.current.active) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    element.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
  };

  const handleDragPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) {
      return;
    }

    dragStateRef.current.active = false;
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const showScrollControls = canScrollLeft || canScrollRight;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="inline-flex h-5 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
            {group.col.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.col.logo_url}
                alt={group.col.ecommerce_name}
                className="h-full w-auto max-w-28 object-contain object-left"
              />
            ) : (
              <span className="text-xs font-bold uppercase text-zinc-600">
                {group.col.ecommerce_name}
              </span>
            )}
          </div>
          <span className="whitespace-nowrap text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
            totale: {group.cards.length}
          </span>
        </div>

        {showScrollControls ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollStrip("left")}
              disabled={!canScrollLeft}
              aria-label="Scorri prodotti a sinistra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip("right")}
              disabled={!canScrollRight}
              aria-label="Scorri prodotti a destra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="-mx-4 min-w-0 overflow-x-auto px-4 pb-1 scrollbar-none touch-pan-x sm:-mx-1 sm:px-1"
      >
        <div className="flex w-max items-stretch">
          {visibleCards.map((card, index) => {
            const ui = cardState[card.key] ?? {
              hidden: false,
              selected: false,
              quantity: 1,
            };

            return (
              <Fragment key={card.key}>
                {index > 0 && showScrollControls ? (
                  <div
                    role="separator"
                    aria-label="Trascina per scorrere i prodotti"
                    onPointerDown={handleDragPointerDown}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerEnd}
                    onPointerCancel={handleDragPointerEnd}
                    className={`hidden w-3 shrink-0 items-center justify-center self-stretch text-zinc-300 transition-colors hover:text-zinc-500 [@media(hover:hover)_and_(pointer:fine)]:flex dark:text-zinc-600 dark:hover:text-zinc-400 ${
                      isDragging ? "cursor-grabbing" : "cursor-grab"
                    }`}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </div>
                ) : null}

                <div data-strip-card className="shrink-0">
                  <MatchCardItem
                    card={card}
                    quantity={ui.quantity}
                    isSelected={ui.selected}
                    hideEcommerceBadge
                    onQuantityChange={(next) => onQuantityChange(card.key, next)}
                    onToggleSelected={() => onToggleSelected(card.key)}
                    onAddAsReferenza={onAddAsReferenza}
                    isAddingReferenza={isAddingReferenza}
                  />
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AddReferenzaInlineRow({
  onConfirm,
  onCancel,
  isSubmitting,
  error,
}: {
  onConfirm: (productName: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [query, setQuery] = useState("");

  const handleSelect = (productName: string) => {
    const trimmed = productName.trim();
    if (!trimmed || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <div className="mx-auto w-full max-w-lg text-left">
      <div className="flex items-center gap-2">
        <ProductSearchCombobox
          value={query}
          onChange={setQuery}
          onSelect={handleSelect}
          onAddFromInput={() => {
            if (query.trim()) handleSelect(query);
          }}
          disabled={isSubmitting}
          autoFocus
          placeholder="Cerca un prodotto..."
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          annulla
        </button>
      </div>

      {isSubmitting ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Aggiunta...
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

export function TopMatchPerReferenzaSection({
  confronto,
  cardState,
  onCardStateChange,
  onCardQuantityChange,
  onToggleSelected,
  onAddReferenza,
  onRemoveReferenza,
  onRegisterScrollToReferenza,
  onRegisterOpenAddReferenza,
  isAddingReferenza = false,
  isRemovingReferenza = false,
  addReferenzaError = null,
  removeReferenzaError = null,
}: {
  confronto: RisultatoConfronto;
  cardState: CardStateMap;
  onCardStateChange: (next: CardStateMap) => void;
  onCardQuantityChange?: (key: string, next: number) => void;
  onToggleSelected: (cardKey: string) => void;
  onAddReferenza?: (insertAfterIndex: number, productName: string) => void;
  onRemoveReferenza?: (queryIndex: number) => void;
  onRegisterScrollToReferenza?: (fn: (queryIndex: number) => void) => void;
  onRegisterOpenAddReferenza?: (fn: () => void) => void;
  isAddingReferenza?: boolean;
  isRemovingReferenza?: boolean;
  addReferenzaError?: string | null;
  removeReferenzaError?: string | null;
}) {
  const rows = confronto.top_match_per_referenza;
  const ecommerceById = useMemo(
    () =>
      Object.fromEntries(
        confronto.tabelle_ecommerce.map((col) => [col.ecommerce_id, col])
      ),
    [confronto.tabelle_ecommerce]
  );

  const [collapsedRows, setCollapsedRows] = useState<Record<number, boolean>>({});
  const [addingAfterIndex, setAddingAfterIndex] = useState<number | null>(null);
  const [deleteArmedIndex, setDeleteArmedIndex] = useState<number | null>(null);
  const prevAddingReferenza = useRef(isAddingReferenza);
  const prevRemovingReferenza = useRef(isRemovingReferenza);
  const pendingScrollToAddRef = useRef<number | null>(null);

  const canRemoveReferenza = confronto.prodotti_richiesti.length > 1;

  useEffect(() => {
    if (
      prevAddingReferenza.current &&
      !isAddingReferenza &&
      !addReferenzaError
    ) {
      setAddingAfterIndex(null);
    }
    prevAddingReferenza.current = isAddingReferenza;
  }, [isAddingReferenza, addReferenzaError]);

  useEffect(() => {
    if (
      prevRemovingReferenza.current &&
      !isRemovingReferenza &&
      !removeReferenzaError
    ) {
      setDeleteArmedIndex(null);
    }
    prevRemovingReferenza.current = isRemovingReferenza;
  }, [isRemovingReferenza, removeReferenzaError]);

  const handleTrashClick = (queryIndex: number) => {
    if (!onRemoveReferenza || !canRemoveReferenza || isRemovingReferenza) {
      return;
    }

    if (deleteArmedIndex === queryIndex) {
      onRemoveReferenza(queryIndex);
      return;
    }

    setDeleteArmedIndex(queryIndex);
    setAddingAfterIndex(null);
  };

  const rowsWithCards = useMemo(() => {
    if (!rows) {
      return [];
    }

    return rows
      .map((row) => {
        const ecommerceGroups: EcommerceMatchGroup[] = row.per_ecommerce.flatMap(
          (entry) => {
            const col = ecommerceById[entry.ecommerce_id];
            if (!col || entry.candidati.length === 0) {
              return [];
            }

            return [
              {
                ecommerceId: entry.ecommerce_id,
                col,
                cards: entry.candidati.map((candidato) => ({
                  key: `${row.query_index}-${entry.ecommerce_id}-${candidato.id}`,
                  col,
                  candidato,
                })),
              },
            ];
          }
        );

        const matchCards = ecommerceGroups.flatMap((group) => group.cards);

        return { row, ecommerceGroups, matchCards };
      })
      .sort((a, b) => a.row.query_index - b.row.query_index);
  }, [rows, ecommerceById]);

  const allEcommerceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const { ecommerceGroups } of rowsWithCards) {
      for (const group of ecommerceGroups) {
        ids.add(group.ecommerceId);
      }
    }
    return [...ids];
  }, [rowsWithCards]);

  const ecommerceOrderRef = useRef<string[] | null>(null);
  const shuffleSeed = confronto.prodotti_richiesti.join("\0");

  const ecommerceOrder = useMemo(() => {
    if (!ecommerceOrderRef.current) {
      ecommerceOrderRef.current = seededShuffleIds(allEcommerceIds, shuffleSeed);
      return ecommerceOrderRef.current;
    }

    const known = new Set(ecommerceOrderRef.current);
    const missing = allEcommerceIds.filter((id) => !known.has(id));

    if (missing.length > 0) {
      ecommerceOrderRef.current = [
        ...ecommerceOrderRef.current,
        ...seededShuffleIds(missing, `${shuffleSeed}:${missing.sort().join(",")}`),
      ];
    }

    ecommerceOrderRef.current = ecommerceOrderRef.current.filter((id) =>
      allEcommerceIds.includes(id)
    );

    return ecommerceOrderRef.current;
  }, [allEcommerceIds, shuffleSeed]);

  if (!rows || rows.length === 0) {
    return null;
  }

  const allCollapsed = rowsWithCards.every(
    ({ row }) => collapsedRows[row.query_index]
  );

  const toggleCollapseAll = () => {
    const next = !allCollapsed;
    setCollapsedRows(
      Object.fromEntries(
        rowsWithCards.map(({ row }) => [row.query_index, next])
      )
    );
  };

  const toggleRowCollapsed = (queryIndex: number) => {
    setCollapsedRows((current) => ({
      ...current,
      [queryIndex]: !current[queryIndex],
    }));
  };

  const updateCardState = (
    key: string,
    patch: Partial<CardStateMap[string]>
  ) => {
    if (patch.quantity != null && onCardQuantityChange) {
      onCardQuantityChange(key, patch.quantity);
      return;
    }

    const current = cardState[key] ?? {
      hidden: false,
      selected: false,
      quantity: 1,
    };
    onCardStateChange({
      ...cardState,
      [key]: { ...current, ...patch },
    });
  };

  const scrollToReferenza = useCallback((queryIndex: number) => {
    setCollapsedRows((current) => ({
      ...current,
      [queryIndex]: false,
    }));

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(`referenza-${queryIndex}`);
        if (!element) {
          return;
        }

        element.scrollIntoView({ behavior: "smooth", block: "start" });
        element.focus({ preventScroll: true });
      });
    });
  }, []);

  useEffect(() => {
    onRegisterScrollToReferenza?.(scrollToReferenza);
  }, [onRegisterScrollToReferenza, scrollToReferenza]);

  const focusAddReferenzaInput = useCallback((queryIndex: number) => {
    const element = document.getElementById(`add-referenza-after-${queryIndex}`);
    const input = element?.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement | null;
    input?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (addingAfterIndex === null) {
      return;
    }

    const element = document.getElementById(
      `add-referenza-after-${addingAfterIndex}`
    );
    if (!element) {
      return;
    }

    if (pendingScrollToAddRef.current === addingAfterIndex) {
      pendingScrollToAddRef.current = null;
      element.scrollIntoView({ behavior: "smooth", block: "start" });

      const timer = window.setTimeout(() => {
        focusAddReferenzaInput(addingAfterIndex);
      }, 400);

      return () => window.clearTimeout(timer);
    }

    focusAddReferenzaInput(addingAfterIndex);
  }, [addingAfterIndex, focusAddReferenzaInput]);

  const openAddReferenzaAtEnd = useCallback(() => {
    const lastRow = rowsWithCards[rowsWithCards.length - 1];
    if (!lastRow || !onAddReferenza) {
      return;
    }

    const queryIndex = lastRow.row.query_index;
    pendingScrollToAddRef.current = queryIndex;
    setAddingAfterIndex(queryIndex);
    setDeleteArmedIndex(null);
  }, [onAddReferenza, rowsWithCards]);

  useEffect(() => {
    onRegisterOpenAddReferenza?.(openAddReferenzaAtEnd);
  }, [onRegisterOpenAddReferenza, openAddReferenzaAtEnd]);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Seleziona i prodotti migliori per ogni tua esigenza.
          </p>
        </div>

        <button
          type="button"
          onClick={toggleCollapseAll}
          className="shrink-0 self-end rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 sm:self-auto dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {allCollapsed ? "apri tutte" : "chiudi tutte"}
        </button>
      </div>

      {removeReferenzaError ? (
        <p className="text-sm text-red-600 dark:text-red-400">{removeReferenzaError}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {rowsWithCards.map(({ row, ecommerceGroups, matchCards }) => {
          const isCollapsed = Boolean(collapsedRows[row.query_index]);
          const orderedGroups = orderEcommerceGroups(
            ecommerceGroups,
            ecommerceOrder
          );

          return (
            <div key={row.query_index} className="flex flex-col gap-3">
              <article
                id={`referenza-${row.query_index}`}
                tabIndex={-1}
                className="min-w-0 scroll-mt-24 rounded-2xl border border-zinc-200/80 bg-zinc-100 p-4 outline-none dark:border-zinc-900 dark:bg-zinc-900/50 sm:p-5"
              >
                <div className={isCollapsed ? "" : "mb-4"}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="flex shrink-0 items-center gap-2 self-end sm:order-2 sm:self-auto">
                      <span className="whitespace-nowrap text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
                        totale: {matchCards.length}
                      </span>

                      {onRemoveReferenza && canRemoveReferenza ? (
                        <button
                          type="button"
                          onClick={() => handleTrashClick(row.query_index)}
                          disabled={isRemovingReferenza}
                          aria-label={
                            deleteArmedIndex === row.query_index
                              ? "Conferma eliminazione referenza"
                              : "Elimina referenza"
                          }
                          className={`rounded-lg p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            deleteArmedIndex === row.query_index
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "bg-white text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-red-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                          }`}
                        >
                          {isRemovingReferenza && deleteArmedIndex === row.query_index ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleRowCollapsed(row.query_index)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left text-sm font-medium leading-snug transition-colors hover:text-zinc-600 sm:order-1 sm:text-base dark:hover:text-zinc-300"
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                          isCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                      <span className="min-w-0">
                        <span aria-hidden="true" className="mr-1.5">
                          🔎
                        </span>
                        {row.query_text}
                      </span>
                    </button>
                  </div>
                </div>

                {!isCollapsed ? (
                  matchCards.length > 0 ? (
                    <div className="flex flex-col gap-5">
                      {orderedGroups.map((group) => (
                        <EcommerceMatchStrip
                          key={group.ecommerceId}
                          group={group}
                          visibleCards={group.cards}
                          cardState={cardState}
                          onQuantityChange={(key, next) =>
                            updateCardState(key, { quantity: next })
                          }
                          onToggleSelected={onToggleSelected}
                          onAddAsReferenza={
                            onAddReferenza
                              ? (productName) => {
                                  onAddReferenza(row.query_index, productName);
                                  setDeleteArmedIndex(null);
                                }
                              : undefined
                          }
                          isAddingReferenza={isAddingReferenza}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      Nessun match trovato per questa referenza.
                    </p>
                  )
                ) : null}
              </article>

              {onAddReferenza ? (
                <div
                  id={`add-referenza-after-${row.query_index}`}
                  tabIndex={-1}
                  className="scroll-mt-24 outline-none"
                >
                  {addingAfterIndex === row.query_index ? (
                    <AddReferenzaInlineRow
                      onConfirm={(productName) => {
                        onAddReferenza(row.query_index, productName);
                      }}
                      onCancel={() => setAddingAfterIndex(null)}
                      isSubmitting={isAddingReferenza}
                      error={addReferenzaError}
                    />
                  ) : (
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingAfterIndex(row.query_index);
                          setDeleteArmedIndex(null);
                        }}
                        disabled={isAddingReferenza || addingAfterIndex !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-light text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
                      >
                        <Plus className="h-4 w-4" />
                        aggiungi nuovo prodotto 🔎
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
