"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EcommerceLogoBadge } from "@/app/components/chat/EcommerceLogoBadge";

export type IntroDemoProduct = {
  id: string;
  productName: string;
  brand: string | null;
  price: number;
};

export type IntroDemoEcommerceGroup = {
  ecommerceId: string;
  ecommerceName: string;
  logoUrl: string | null;
  products: IntroDemoProduct[];
};

export type IntroDemoData = {
  queryText: string;
  groups: IntroDemoEcommerceGroup[];
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function DemoQueryLine({ queryText }: { queryText: string }) {
  return (
    <p className="text-sm font-medium leading-snug text-zinc-900 sm:text-base dark:text-zinc-100">
      <span aria-hidden="true" className="mr-1.5">
        🔎
      </span>
      {queryText}
    </p>
  );
}

function DemoProductCard({
  product,
  selected = false,
  dimmed = false,
}: {
  product: IntroDemoProduct;
  selected?: boolean;
  dimmed?: boolean;
}) {
  return (
    <motion.div
      layout
      animate={{
        opacity: dimmed ? 0.72 : 1,
        scale: selected ? 1 : 0.98,
      }}
      transition={{ duration: 0.25 }}
      className={`relative w-44 shrink-0 rounded-xl p-3 sm:w-48 ${
        selected
          ? "border-[3px] border-zinc-900 bg-white shadow-md dark:border-zinc-100 dark:bg-zinc-950"
          : "border border-zinc-200/60 bg-white/70 dark:border-zinc-700/50 dark:bg-zinc-950/40"
      }`}
    >
      <div className="absolute right-2 top-2">
        <div
          className={`rounded-md p-1 ${
            selected
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-400"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </div>
      </div>

      <p className="min-h-10 pr-6 text-[11px] leading-snug sm:text-xs">
        {product.productName}
      </p>
      {product.brand ? (
        <p className="mt-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
          {product.brand}
        </p>
      ) : null}
      <p className="mt-3 text-sm font-bold tabular-nums tracking-tight">
        {formatPrice(product.price)}
      </p>
    </motion.div>
  );
}

function DemoArticleShell({
  queryText,
  showQuery = true,
  children,
}: {
  queryText: string;
  showQuery?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-zinc-100 p-4 dark:border-zinc-900 dark:bg-zinc-900/50 sm:p-5">
      {showQuery ? (
        <div className={children ? "mb-4" : undefined}>
          <DemoQueryLine queryText={queryText} />
        </div>
      ) : null}
      {children}
    </article>
  );
}

function DemoEcommerceStrip({
  group,
  selectedProductId,
  animateSelection = false,
  maxProducts = 3,
}: {
  group: IntroDemoEcommerceGroup;
  selectedProductId?: string | null;
  animateSelection?: boolean;
  maxProducts?: number;
}) {
  const products = group.products.slice(0, maxProducts);
  const hasSelection = selectedProductId != null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <EcommerceLogoBadge
          logoUrl={group.logoUrl}
          name={group.ecommerceName}
          fallback="full"
        />
        <span className="whitespace-nowrap text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">
          totale: {group.products.length}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {products.map((product) => {
          const selected = selectedProductId === product.id;
          const dimmed =
            animateSelection && hasSelection && !selected && products.length > 1;

          return (
            <DemoProductCard
              key={product.id}
              product={product}
              selected={selected}
              dimmed={dimmed}
            />
          );
        })}
      </div>
    </div>
  );
}

export function IntroTabLeggiDemo({ demo }: { demo: IntroDemoData }) {
  return (
    <DemoArticleShell queryText={demo.queryText} showQuery />
  );
}

export function IntroTabConfrontaDemo({ demo }: { demo: IntroDemoData }) {
  return (
    <DemoArticleShell queryText={demo.queryText}>
      {demo.groups.length > 0 ? (
        <div className="flex flex-col gap-4">
          {demo.groups.map((group) => (
            <DemoEcommerceStrip key={group.ecommerceId} group={group} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nessun match trovato per questa referenza.
        </p>
      )}
    </DemoArticleShell>
  );
}

export function IntroTabSelezionaDemo({
  demo,
  active,
}: {
  demo: IntroDemoData;
  active: boolean;
}) {
  const animationGroup = useMemo(
    () => demo.groups.find((group) => group.products.length >= 2) ?? demo.groups[0],
    [demo.groups]
  );

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    animationGroup?.products[0]?.id ?? null
  );

  useEffect(() => {
    if (!active || !animationGroup || animationGroup.products.length < 2) {
      setSelectedProductId(animationGroup?.products[0]?.id ?? null);
      return;
    }

    let index = 0;
    setSelectedProductId(animationGroup.products[index]?.id ?? null);

    const timer = window.setInterval(() => {
      index = (index + 1) % animationGroup.products.length;
      setSelectedProductId(animationGroup.products[index]?.id ?? null);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [active, animationGroup]);

  return (
    <DemoArticleShell queryText={demo.queryText}>
      {demo.groups.length > 0 ? (
        <div className="flex flex-col gap-4">
          {demo.groups.map((group, index) => {
            const isAnimatedGroup =
              group.ecommerceId === animationGroup?.ecommerceId;
            const isSecondGroup = index === 1;
            const selectedId = isAnimatedGroup
              ? selectedProductId
              : isSecondGroup
                ? (group.products[0]?.id ?? null)
                : null;

            return (
              <DemoEcommerceStrip
                key={group.ecommerceId}
                group={group}
                selectedProductId={selectedId}
                animateSelection={isAnimatedGroup || isSecondGroup}
                maxProducts={isAnimatedGroup ? 4 : 2}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nessun match trovato per questa referenza.
        </p>
      )}
    </DemoArticleShell>
  );
}

export function IntroTabTotaleDemo({
  prezzoTotale,
  showPendingOptimization = false,
}: {
  prezzoTotale: number;
  showPendingOptimization?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4">

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 24, stiffness: 280 }}
        className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 sm:gap-2 sm:px-5 sm:py-3.5"
      >
        <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
          💸
        </span>
        {showPendingOptimization ? (
          <span className="text-lg leading-none sm:text-xl" aria-hidden="true">
            ⚡
          </span>
        ) : null}
        <span className="text-lg font-bold tabular-nums tracking-tight sm:text-xl">
          {formatPrice(prezzoTotale)}
        </span>
      </motion.div>

      <p className="max-w-sm text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Si aggiorna ogni volta che cambi selezione o quantità, così sai sempre
        quanto spendi nel complesso.
      </p>
    </div>
  );
}
