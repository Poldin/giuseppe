"use client";

import type { RelatedPubProduct } from "@/app/lib/pub/related";
import { formatPubPrice } from "@/app/lib/pub/product";
import { pubProductPath } from "@/app/lib/seo/pub-product";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const badgeClassName =
  "inline-flex h-7 w-fit max-w-full items-center rounded-md bg-white px-2.5 py-1 ring-1 ring-zinc-100 dark:ring-zinc-800";

function trackRelatedClick(payload: {
  fromProductId: string;
  toProductId: string;
  fromPubSlug: string;
  toPubSlug: string;
}) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/pub/related-click", blob);
    if (sent) return;
  }

  void fetch("/api/pub/related-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // tracking best-effort
  });
}

export function PubRelatedProducts({
  fromProductId,
  fromPubSlug,
}: {
  fromProductId: string;
  fromPubSlug: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [products, setProducts] = useState<RelatedPubProduct[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void fetch(`/api/pub/related?slug=${encodeURIComponent(fromPubSlug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return [];
        const data = (await response.json()) as { products?: RelatedPubProduct[] };
        return Array.isArray(data.products) ? data.products : [];
      })
      .then((nextProducts) => {
        if (!cancelled) setProducts(nextProducts);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fromPubSlug]);

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
  }, [updateScrollState, products.length]);

  const getScrollStep = (element: HTMLDivElement) => {
    const track = element.firstElementChild;
    if (!track) return 288;

    const cards = track.querySelectorAll<HTMLElement>("[data-related-card]");
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
    if (!element) return;

    const amount = getScrollStep(element);
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  if (products.length === 0) return null;

  const showScrollControls = canScrollLeft || canScrollRight;

  return (
    <section
      className="mt-14 min-w-0 border-t border-zinc-100 pt-8 dark:border-zinc-900"
      aria-labelledby="prodotti-correlati-heading"
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2
          id="prodotti-correlati-heading"
          className="text-lg uppercase tracking-tighter"
        >
          potrebbero interessarti
        </h2>

        {showScrollControls ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => scrollStrip("left")}
              disabled={!canScrollLeft}
              aria-label="Scorri prodotti a sinistra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip("right")}
              disabled={!canScrollRight}
              aria-label="Scorri prodotti a destra"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="-mx-4 min-w-0 overflow-x-auto px-4 pb-1 scrollbar-none touch-[pan-x_pan-y] sm:-mx-1 sm:px-1"
      >
        <ul className="flex w-max items-stretch gap-3">
          {products.map((item) => {
            const priceLabel = formatPubPrice(item.final_price);
            const shop = item.ecommerce;

            return (
              <li key={item.id} data-related-card className="shrink-0">
                <Link
                  href={pubProductPath(item.pub_slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackRelatedClick({
                      fromProductId,
                      toProductId: item.id,
                      fromPubSlug,
                      toPubSlug: item.pub_slug,
                    })
                  }
                  className="flex h-full w-64 flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white p-4 transition-[box-shadow,border-color] hover:border-zinc-300 hover:shadow-sm sm:w-72 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
                >
                  {shop ? (
                    <span className={badgeClassName}>
                      {shop.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={shop.logo_url}
                          alt={shop.name}
                          className="h-full w-auto max-w-32 object-contain object-left"
                        />
                      ) : (
                        <span className="text-xs font-bold uppercase text-zinc-600 dark:text-zinc-400">
                          {shop.name.slice(0, 2)}
                        </span>
                      )}
                    </span>
                  ) : null}

                  <div className="flex min-h-12 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                      {item.product_name}
                    </span>
                    {item.brand ? (
                      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {item.brand}
                      </span>
                    ) : null}
                  </div>

                  {priceLabel ? (
                    <span className="text-base font-bold tabular-nums tracking-tight">
                      {priceLabel}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
