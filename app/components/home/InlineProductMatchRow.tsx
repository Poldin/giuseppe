"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { EcommerceLogoBadge } from "@/app/components/chat/EcommerceLogoBadge";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";

function formatEuro(value: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatDiscountPercent(
  discount: number | null | undefined
): string | null {
  if (discount == null || discount <= 0) return null;
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: Number.isInteger(discount) ? 0 : 1,
  }).format(discount);
}

function GiuseppePulse() {
  return (
    <motion.div
      className="relative h-6 w-6 shrink-0 overflow-hidden rounded-md"
      animate={{ scale: [1, 1.1, 1], opacity: [0.65, 1, 0.65] }}
      transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden
    >
      <Image
        src="/giuseppe.jpeg"
        alt=""
        fill
        className="object-cover"
        sizes="24px"
      />
    </motion.div>
  );
}

function InlineMatchCard({
  match,
  isSelected,
  onSelect,
}: {
  match: InlineMatchCandidate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const productUrl = match.original_url?.trim() || null;
  const discountPercent = formatDiscountPercent(match.discount);

  const cardClassName = isSelected
    ? "border-[3px] border-zinc-900 bg-white shadow-md dark:border-zinc-100 dark:bg-zinc-950"
    : "border border-zinc-200/40 bg-white/25 opacity-75 dark:border-zinc-700/35 dark:bg-zinc-950/25";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? "Selezionato" : "Seleziona"} ${match.product_name}`}
      className={`relative flex h-full w-56 shrink-0 flex-col rounded-xl p-3 text-left transition-[opacity,box-shadow,border-color] hover:opacity-90 hover:shadow-sm sm:w-64 ${cardClassName}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <EcommerceLogoBadge logoUrl={match.logo_url} name={match.ecommerce_name} />
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-light text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            vedi
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="min-h-10 flex flex-1 flex-col gap-0.5">
        <span className="line-clamp-3 text-xs leading-snug text-zinc-900 dark:text-zinc-100">
          {match.product_name}
        </span>
        {match.brand ? (
          <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            {match.brand}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col items-start gap-1">
        {discountPercent ? (
          <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            ⬇️-{discountPercent}% sconto
          </span>
        ) : null}
        <span className="text-base font-bold tabular-nums tracking-tight">
          {formatEuro(match.prezzo)}
        </span>
      </div>
    </button>
  );
}

export type InlineProductRowStatus = "loading" | "ready" | "empty" | "error";

export function InlineProductMatchRow({
  query,
  status,
  matches,
  selectedId,
  expanded,
  disabled = false,
  onToggleExpanded,
  onSelectMatch,
  onRemove,
}: {
  query: string;
  status: InlineProductRowStatus;
  matches: InlineMatchCandidate[];
  selectedId: string | null;
  expanded: boolean;
  disabled?: boolean;
  onToggleExpanded: () => void;
  onSelectMatch: (id: string) => void;
  onRemove: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedCardRef = useRef<HTMLDivElement>(null);
  const wasExpandedRef = useRef(false);

  const selected =
    matches.find((match) => match.id === selectedId) ?? matches[0] ?? null;
  const canExpand = status === "ready" && matches.length > 0;

  useEffect(() => {
    if (!expanded || !canExpand) {
      wasExpandedRef.current = false;
      return;
    }

    const justExpanded = !wasExpandedRef.current;
    wasExpandedRef.current = true;

    // Solo all'apertura: ricentrare a ogni click disorienta.
    if (!justExpanded) return;

    const scrollToSelected = () => {
      const container = scrollRef.current;
      const card = selectedCardRef.current;
      if (!container || !card) return;

      const containerRect = container.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const nextLeft =
        container.scrollLeft +
        (cardRect.left - containerRect.left) -
        (containerRect.width - cardRect.width) / 2;

      container.scrollTo({ left: Math.max(0, nextLeft), behavior: "auto" });
    };

    const timeout = window.setTimeout(scrollToSelected, 240);
    return () => window.clearTimeout(timeout);
  }, [expanded, canExpand]);

  return (
    <li className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={canExpand ? onToggleExpanded : undefined}
          disabled={!canExpand || disabled}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
          aria-expanded={canExpand ? expanded : undefined}
        >
          {canExpand ? (
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          ) : null}

          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {query}
          </span>

          {status === "loading" ? (
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-500">
              <GiuseppePulse />
              <span className="hidden sm:inline">confronto…</span>
            </span>
          ) : null}

          {status === "ready" && selected ? (
            <motion.span
              key={selected.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex shrink-0 items-center gap-2"
            >
              <EcommerceLogoBadge
                logoUrl={selected.logo_url}
                name={selected.ecommerce_name}
              />
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatEuro(selected.prezzo)}
              </span>
            </motion.span>
          ) : null}

          {status === "empty" ? (
            <span className="shrink-0 text-[10px] text-zinc-400">
              nessun match
            </span>
          ) : null}

          {status === "error" ? (
            <span className="shrink-0 text-[10px] text-red-500">errore</span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Rimuovi ${query}`}
          className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X size={14} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && canExpand ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-zinc-100 dark:border-zinc-800"
          >
            <p className="px-3 pt-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              {matches.length}{" "}
              {matches.length === 1 ? "risultato" : "risultati"}
            </p>
            <div
              ref={scrollRef}
              className="overflow-x-auto px-3 pb-3 pt-2 scrollbar-thin [scrollbar-color:rgb(212_212_216)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgb(82_82_91)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300/70 [&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600/60"
            >
              <div className="flex w-max gap-2">
                {matches.map((match, index) => {
                  const isSelected = selected?.id === match.id;
                  return (
                    <motion.div
                      key={match.id}
                      ref={isSelected ? selectedCardRef : undefined}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(index * 0.04, 0.24),
                        ease: "easeOut",
                      }}
                    >
                      <InlineMatchCard
                        match={match}
                        isSelected={isSelected}
                        onSelect={() => onSelectMatch(match.id)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
