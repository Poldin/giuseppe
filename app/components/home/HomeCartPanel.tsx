"use client";

import { EcommerceLogoBadge } from "@/app/components/chat/EcommerceLogoBadge";
import { QuantityControl } from "@/app/components/chat/QuantityControl";
import { HomeShareButton } from "@/app/components/home/HomeShareButton";
import {
  buildShippingHints,
  calcolaSpedizione,
  formatShippingHintsSentence,
  type ShippingTier,
} from "@/app/lib/search/shipping-cost";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ShoppingCart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type HomeCartLine = {
  id: string;
  rowId: string;
  matchId: string;
  query: string;
  productName: string;
  brand: string | null;
  ecommerceId: string;
  ecommerceName: string;
  logoUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type CartGroup = {
  ecommerceId: string;
  ecommerceName: string;
  logoUrl: string | null;
  lines: HomeCartLine[];
  subtotal: number;
};

type CartGroupWithShipping = CartGroup & {
  shipping: number;
  hintSentence: string | null;
  total: number;
};

function formatEuro(value: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function groupByEcommerce(lines: HomeCartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const line of lines) {
    const key = line.ecommerceId || line.ecommerceName;
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.subtotal += line.lineTotal;
    } else {
      groups.set(key, {
        ecommerceId: key,
        ecommerceName: line.ecommerceName,
        logoUrl: line.logoUrl,
        lines: [line],
        subtotal: line.lineTotal,
      });
    }
  }

  return Array.from(groups.values());
}

function buildGroupsWithShipping(
  lines: HomeCartLine[],
  tiersByEcommerce: Record<string, ShippingTier[]>
): CartGroupWithShipping[] {
  return groupByEcommerce(lines).map((group) => {
    const tiers = tiersByEcommerce[group.ecommerceId] ?? [];
    const shipping = calcolaSpedizione(group.subtotal, tiers);
    const hints = buildShippingHints(group.subtotal, tiers);
    return {
      ...group,
      shipping,
      hintSentence: formatShippingHintsSentence(hints, formatEuro),
      total: group.subtotal + shipping,
    };
  });
}

function CartBody({
  isEmpty,
  groupsWithShipping,
  disabled,
  onQuantityChange,
  onRemove,
  scrollClassName,
}: {
  isEmpty: boolean;
  groupsWithShipping: CartGroupWithShipping[];
  disabled: boolean;
  onQuantityChange: (lineId: string, next: number) => void;
  onRemove: (lineId: string) => void;
  scrollClassName: string;
}) {
  if (isEmpty) {
    return (
      <div className="px-4 py-10">
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Aggiungi prodotti dal confronto: compariranno qui, raggruppati per
          negozio, con spedizione inclusa.
        </p>
      </div>
    );
  }

  return (
    <div className={scrollClassName}>
      <AnimatePresence initial={false}>
        {groupsWithShipping.map((group, groupIndex) => (
          <motion.section
            key={group.ecommerceId}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={
              groupIndex > 0
                ? "mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-900"
                : undefined
            }
            aria-label={group.ecommerceName}
          >
            <div className="mb-0.5 flex items-center gap-2.5">
              <EcommerceLogoBadge
                logoUrl={group.logoUrl}
                name={group.ecommerceName}
              />
              <span className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                {formatEuro(group.total)}
              </span>
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              prodotti {formatEuro(group.subtotal)}
              <span className="mx-1 text-zinc-300 dark:text-zinc-700">·</span>
              spedizione{" "}
              {group.shipping > 0 ? formatEuro(group.shipping) : "0 €"}
            </p>
            {group.hintSentence ? (
              <p className="mb-3 w-fit max-w-full rounded-md bg-amber-50 px-2 py-1 text-[10px] font-light leading-snug text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {group.hintSentence}
              </p>
            ) : null}

            <ul className="flex flex-col gap-3">
              {group.lines.map((line) => (
                <li key={line.id} className="group/line">
                  <div className="flex items-start gap-2.5">
                    <QuantityControl
                      quantity={line.quantity}
                      onQuantityChange={(next) =>
                        onQuantityChange(line.id, next)
                      }
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                          <span className="line-clamp-2">{line.productName}</span>
                        </p>
                        <div className="flex shrink-0 items-start gap-1">
                          <span className="pt-px text-[13px] font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                            {formatEuro(line.lineTotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemove(line.id)}
                            disabled={disabled}
                            aria-label={`Rimuovi ${line.productName} dal carrello`}
                            className="rounded-md p-0.5 text-zinc-300 opacity-70 transition-all hover:bg-zinc-100 hover:text-zinc-700 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 group-hover/line:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                          >
                            <X size={13} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                      {line.brand || line.quantity > 1 ? (
                        <div className="mt-0.5 flex items-baseline justify-between gap-2">
                          {line.brand ? (
                            <p className="min-w-0 truncate text-[10px] tracking-wide text-zinc-400 dark:text-zinc-500">
                              {line.brand}
                            </p>
                          ) : (
                            <span />
                          )}
                          {line.quantity > 1 ? (
                            <p className="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                              {formatEuro(line.unitPrice)} / cad.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>

      <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-900">
        <HomeShareButton className="w-full justify-center" />
      </div>
    </div>
  );
}

function MobileCartFab({
  isEmpty,
  grandTotal,
  priceBumpKey,
  onOpen,
}: {
  isEmpty: boolean;
  grandTotal: number;
  priceBumpKey: number;
  onOpen: () => void;
}) {
  return (
    <AnimatePresence>
      {!isEmpty ? (
        <motion.button
          key="mobile-cart-fab"
          type="button"
          initial={{ opacity: 0, y: 16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.92 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={onOpen}
          aria-label={`Apri carrello, totale ${formatEuro(grandTotal)}`}
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-zinc-900 py-3 pl-3.5 pr-4 text-white shadow-lg shadow-zinc-900/25 min-[1100px]:hidden dark:bg-zinc-100 dark:text-zinc-950 dark:shadow-black/40"
        >
          <ShoppingCart size={18} strokeWidth={2.25} aria-hidden />
          <motion.span
            key={priceBumpKey}
            initial={{ scale: 1.18, opacity: 0.55 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="text-sm font-black tabular-nums tracking-tight"
          >
            {formatEuro(grandTotal)}
          </motion.span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

function MobileCartDialog({
  open,
  onClose,
  isEmpty,
  grandTotal,
  groupsWithShipping,
  disabled,
  onQuantityChange,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  isEmpty: boolean;
  grandTotal: number;
  groupsWithShipping: CartGroupWithShipping[];
  disabled: boolean;
  onQuantityChange: (lineId: string, next: number) => void;
  onRemove: (lineId: string) => void;
}) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mobile-cart-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Carrello"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex flex-col bg-white min-[1100px]:hidden dark:bg-zinc-950"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-900">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-100">
              <ShoppingCart
                size={16}
                strokeWidth={2.25}
                aria-hidden
                className="shrink-0"
              />
              Carrello
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-lg font-black tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                {isEmpty ? "—" : formatEuro(grandTotal)}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi carrello"
                className="inline-flex items-center justify-center rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <X size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <CartBody
              isEmpty={isEmpty}
              groupsWithShipping={groupsWithShipping}
              disabled={disabled}
              onQuantityChange={onQuantityChange}
              onRemove={onRemove}
              scrollClassName="px-4 py-3"
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function HomeCartPanel({
  lines,
  tiersByEcommerce = {},
  disabled = false,
  onQuantityChange,
  onRemove,
}: {
  lines: HomeCartLine[];
  tiersByEcommerce?: Record<string, ShippingTier[]>;
  disabled?: boolean;
  onQuantityChange: (lineId: string, next: number) => void;
  onRemove: (lineId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [priceBumpKey, setPriceBumpKey] = useState(0);
  const prevTotalRef = useRef<number | null>(null);

  const groupsWithShipping = buildGroupsWithShipping(lines, tiersByEcommerce);
  const isEmpty = lines.length === 0;
  const grandTotal = groupsWithShipping.reduce(
    (sum, group) => sum + group.total,
    0
  );

  useEffect(() => {
    if (isEmpty && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isEmpty, mobileOpen]);

  useEffect(() => {
    if (prevTotalRef.current == null) {
      prevTotalRef.current = grandTotal;
      return;
    }
    // Pulse when total changes while mobile FAB is showing (dialog closed)
    // or desktop panel is collapsed.
    const collapsed =
      (!mobileOpen && !isEmpty) || (!expanded && !isEmpty);
    if (prevTotalRef.current !== grandTotal && collapsed) {
      setPriceBumpKey((key) => key + 1);
    }
    prevTotalRef.current = grandTotal;
  }, [grandTotal, mobileOpen, isEmpty, expanded]);

  return (
    <>
      {/* Desktop side panel */}
      <aside
        aria-label="Carrello"
        className="pointer-events-none fixed top-0 right-4 z-30 hidden min-[1100px]:block"
        style={{
          width: "min(26rem, max(17rem, calc(50% - 18.5rem)))",
        }}
      >
        <div className="pointer-events-auto mt-4 flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <header className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-controls="home-cart-body"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <ChevronDown
                size={16}
                strokeWidth={2.25}
                aria-hidden
                className={`shrink-0 text-zinc-400 transition-transform ${
                  expanded ? "" : "-rotate-90"
                }`}
              />
              <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-tighter text-zinc-900 dark:text-zinc-100">
                <ShoppingCart
                  size={16}
                  strokeWidth={2.25}
                  aria-hidden
                  className="shrink-0"
                />
                Carrello
              </h2>
            </button>
            <motion.p
              key={!expanded ? `desktop-total-${priceBumpKey}` : "desktop-total"}
              initial={!expanded ? { scale: 1.12, opacity: 0.6 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="shrink-0 text-lg font-black tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100"
            >
              {isEmpty ? "—" : formatEuro(grandTotal)}
            </motion.p>
          </header>

          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div
                key="cart-body"
                id="home-cart-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mx-4 border-t border-zinc-100 dark:border-zinc-900" />
                <CartBody
                  isEmpty={isEmpty}
                  groupsWithShipping={groupsWithShipping}
                  disabled={disabled}
                  onQuantityChange={onQuantityChange}
                  onRemove={onRemove}
                  scrollClassName="min-h-0 max-h-[calc(100vh-6rem)] overflow-y-auto px-4 py-3 [scrollbar-color:rgb(212_212_216)_transparent] [scrollbar-width:thin] dark:[scrollbar-color:rgb(63_63_70)_transparent]"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </aside>

      {/* Mobile FAB + fullscreen dialog */}
      <MobileCartFab
        isEmpty={isEmpty}
        grandTotal={grandTotal}
        priceBumpKey={priceBumpKey}
        onOpen={() => setMobileOpen(true)}
      />
      <MobileCartDialog
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        isEmpty={isEmpty}
        grandTotal={grandTotal}
        groupsWithShipping={groupsWithShipping}
        disabled={disabled}
        onQuantityChange={onQuantityChange}
        onRemove={onRemove}
      />
    </>
  );
}
