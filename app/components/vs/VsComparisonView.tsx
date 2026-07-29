"use client";

import { PubProductFaq } from "@/app/components/pub/PubProductFaq";
import { VsLiveRefresh } from "@/app/components/vs/VsLiveRefresh";
import {
  formatVsPrice,
  vsShopNamesLabel,
  type VsCombination,
  type VsSide,
} from "@/app/lib/vs/combination";
import { getVsCombinationFaqItems, vsHubPath } from "@/app/lib/seo/vs-combination";
import { pubProductPath } from "@/app/lib/seo/pub-product";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

function ecommerceHref(domain: string | null): string | null {
  if (!domain?.trim()) return null;
  const trimmed = domain.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function medalFor(rank: VsSide["rank"]): string | null {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return null;
}

function ShopBadge({ side }: { side: VsSide }) {
  const shop = side.ecommerce;
  const shopHref = ecommerceHref(shop.domain);
  const className =
    "inline-flex h-7 w-fit max-w-full items-center rounded-md bg-white px-2.5 py-1 ring-1 ring-zinc-100 dark:ring-zinc-800";

  const content = shop.logo_url ? (
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
  );

  if (shopHref) {
    return (
      <a
        href={shopHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visita ${shop.name}`}
        className={className}
      >
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

function SideCard({ side }: { side: VsSide }) {
  const medal = medalFor(side.rank);
  const priceLabel = formatVsPrice(side.final_price);
  const shippingLabel = formatVsPrice(side.shipping_cost);
  const totalLabel = formatVsPrice(side.total_price);
  const productUrl = side.original_url?.trim() || null;
  const rankLabel =
    side.rank === 1
      ? "Primo prezzo"
      : side.rank === 2
        ? "Secondo prezzo"
        : side.rank === 3
          ? "Terzo prezzo"
          : null;

  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 ${
        side.rank === 1
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20"
          : "border-zinc-100 bg-zinc-50/50 dark:border-zinc-900 dark:bg-zinc-900/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <ShopBadge side={side} />
        {medal ? (
          <span className="text-2xl leading-none" aria-label={rankLabel ?? undefined}>
            {medal}
          </span>
        ) : null}
      </div>

      <div className="min-w-0">
        <h2 className="text-base font-bold leading-snug tracking-tight">
          {side.product_name}
        </h2>
        {side.brand ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {side.brand}
          </p>
        ) : null}
      </div>

      {side.is_escluded ? (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Potrebbe non essere disponibile
        </p>
      ) : priceLabel ? (
        <div className="flex flex-col gap-1">
          <p className="text-3xl font-black tracking-tighter tabular-nums">
            {priceLabel}
          </p>
          {shippingLabel != null && side.shipping_cost != null ? (
            <p className="text-xs text-zinc-500">
              Spedizione stimata: {shippingLabel}
              {totalLabel ? ` · Totale ~ ${totalLabel}` : null}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Prezzo non disponibile</p>
      )}

      <div className="mt-1 flex flex-col gap-2">
        {productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            Vedi su {side.ecommerce.name}
            <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        ) : null}
        {side.pub_slug ? (
          <Link
            href={pubProductPath(side.pub_slug)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Scheda su Giuseppe
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function VsComparisonView({
  combination,
}: {
  combination: VsCombination;
}) {
  const [combo, setCombo] = useState(combination);
  const faqItems = getVsCombinationFaqItems(combo);
  const diffLabel = formatVsPrice(combo.price_diff);
  const sortedSides = [...combo.sides].sort((a, b) => {
    const ra = a.rank ?? 999;
    const rb = b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    return a.ecommerce.name.localeCompare(b.ecommerce.name, "it");
  });

  const onUpdate = useCallback((next: VsCombination) => {
    setCombo(next);
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
            <li>
              <Link
                href="/"
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Giuseppe
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={vsHubPath()}
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Confronti prezzi
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">{combo.canonical_name}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Confronto prezzi
          </p>
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {combo.canonical_name}
          </h1>
          <p className="text-sm text-zinc-500">{vsShopNamesLabel(combo)}</p>
        </header>

        <section
          className="mt-8 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-4 dark:border-zinc-900 dark:bg-zinc-900/40"
          aria-label="Differenza di prezzo"
        >
          {diffLabel && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0 ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                {combo.sides.length > 2 ? "Risparmio fino a" : "Differenza"}
              </p>
              <p className="mt-1 text-3xl font-black tracking-tighter tabular-nums text-emerald-700 dark:text-emerald-400">
                {diffLabel}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                conviene di più su {combo.cheaper_shop_name}
              </p>
            </>
          ) : diffLabel && combo.price_diff === 0 ? (
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Stesso prezzo catalogo sugli shop a confronto
            </p>
          ) : (
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Confronto offerte: verifica disponibilità e prezzo sul rivenditore
            </p>
          )}
          <VsLiveRefresh slug={combo.slug} onUpdate={onUpdate} />
        </section>

        <section
          className="mt-8 grid grid-cols-1 gap-4"
          aria-label="Offerte a confronto"
        >
          {sortedSides.map((side) => (
            <SideCard key={side.id || `${side.ecommerce.id}-${side.product_name}`} side={side} />
          ))}
        </section>

        <PubProductFaq items={faqItems} />
      </main>
    </div>
  );
}
