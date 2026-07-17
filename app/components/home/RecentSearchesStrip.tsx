"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecentPublicSearch } from "@/app/lib/search/chat-store";

function formatSearchLabel(products: string[]): string {
  if (products.length === 0) return "";
  if (products.length === 1) return products[0];
  return `${products[0]} +${products.length - 1}`;
}

export function RecentSearchesStrip({
  searches,
  onSelectSearch,
  disabled = false,
}: {
  searches: RecentPublicSearch[];
  onSelectSearch: (products: string[]) => void;
  disabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScroll = element.scrollWidth - element.clientWidth;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, searches.length]);

  const getScrollStep = (element: HTMLDivElement) => {
    const track = element.firstElementChild;
    if (!track) return 200;

    const chips = track.querySelectorAll<HTMLElement>("[data-recent-search-chip]");
    if (chips.length >= 2) {
      return chips[1].offsetLeft - chips[0].offsetLeft;
    }
    if (chips.length === 1) {
      return chips[0].offsetWidth + 8;
    }
    return 200;
  };

  const scrollStrip = (direction: "left" | "right") => {
    const element = scrollRef.current;
    if (!element) return;

    const amount = getScrollStep(element);
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (searches.length === 0) return null;

  const showScrollControls = canScrollLeft || canScrollRight;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          altri utenti hanno cercato:
        </p>
        {showScrollControls ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollStrip("left")}
              disabled={!canScrollLeft}
              aria-label="Scorri ricerche a sinistra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip("right")}
              disabled={!canScrollRight}
              aria-label="Scorri ricerche a destra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
        <div className="flex w-max gap-2">
          {searches.map((search) => (
            <button
              key={search.id}
              type="button"
              data-recent-search-chip
              onClick={() => onSelectSearch(search.products)}
              disabled={disabled}
              aria-label={`Aggiungi ${search.products.length} prodotti: ${search.query_text}`}
              className="flex max-w-[14rem] shrink-0 flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {formatSearchLabel(search.products)}
              </span>
              <span className="truncate text-[10px] text-zinc-500">
                {search.products.length}{" "}
                {search.products.length === 1 ? "prodotto" : "prodotti"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
