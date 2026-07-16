"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Loader2, Plus, Trash2, X } from "lucide-react";

import { QuantityControl } from "@/app/components/chat/QuantityControl";
import { EcommerceLogoBadge } from "@/app/components/chat/EcommerceLogoBadge";
import {
  buildShippingHints,
  calcolaSpedizione,
  type ShippingTier,
} from "@/app/lib/search/shipping-cost";
import type {
  PendingOptimizationSummary,
  PendingRowAssignment,
  PendingRowChange,
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

function RemoveReferenzaButton({
  onRemoveClick,
  isRemoveArmed,
  isRemoving,
  className,
}: {
  onRemoveClick: () => void;
  isRemoveArmed: boolean;
  isRemoving: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onRemoveClick}
      disabled={isRemoving}
      aria-label={
        isRemoveArmed
          ? "Conferma eliminazione referenza"
          : "Elimina referenza"
      }
      className={`shrink-0 rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        isRemoveArmed
          ? "bg-red-600 text-white hover:bg-red-700"
          : "font-light text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
      } ${className ?? ""}`}
    >
      {isRemoving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
    </button>
  );
}

function ScenarioProductBadge({
  productName,
  brand,
  url,
  quantita,
  priceNode,
  onNavigateToReferenza,
  onQuantityChange,
  onRemoveClick,
  isRemoveArmed = false,
  isRemoving = false,
  showPendingMarker = false,
}: {
  productName: string;
  brand?: string | null;
  url: string | null;
  quantita: number;
  priceNode: ReactNode;
  onNavigateToReferenza?: () => void;
  onQuantityChange?: (next: number) => void;
  onRemoveClick?: () => void;
  isRemoveArmed?: boolean;
  isRemoving?: boolean;
  showPendingMarker?: boolean;
}) {
  const nameClassName =
    "block w-full rounded-md bg-white px-2 py-1 text-left text-md font-bold leading-snug break-words text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

  const nameContent = (
    <>
      {showPendingMarker ? (
        <span className="mr-1" aria-hidden="true">
          ⚡
        </span>
      ) : null}
      {productName}
    </>
  );

  return (
    <div className="min-w-0 space-y-1.5 sm:contents">
      <div className="flex min-w-0 items-start gap-1.5 sm:col-start-1 sm:row-start-1">
        {onRemoveClick ? (
          <RemoveReferenzaButton
            onRemoveClick={onRemoveClick}
            isRemoveArmed={isRemoveArmed}
            isRemoving={isRemoving}
            className="mt-0.5 hidden sm:inline-flex"
          />
        ) : null}

        {onNavigateToReferenza ? (
          <button
            type="button"
            onClick={onNavigateToReferenza}
            className={`${nameClassName} transition-colors hover:text-zinc-900 dark:hover:text-zinc-100`}
            aria-label={
              showPendingMarker
                ? `${productName} (modifica consigliata disponibile)`
                : undefined
            }
          >
            {nameContent}
          </button>
        ) : (
          <span
            className={`${nameClassName} text-xs`}
            aria-label={
              showPendingMarker
                ? `${productName} (modifica consigliata disponibile)`
                : undefined
            }
          >
            {nameContent}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:col-start-1 sm:row-start-2">
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

      <div className="flex items-center justify-between gap-3 sm:contents">
        <div className="min-w-0 text-sm tabular-nums text-zinc-600 sm:col-start-2 sm:row-span-2 sm:self-center sm:text-right dark:text-zinc-400">
          {priceNode}
        </div>
        {onRemoveClick ? (
          <RemoveReferenzaButton
            onRemoveClick={onRemoveClick}
            isRemoveArmed={isRemoveArmed}
            isRemoving={isRemoving}
            className="sm:hidden"
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

function formatPendingSavingsLabel(savingsDelta: number): string {
  if (savingsDelta > 0.009) {
    return `Risparmi ${formatPrice(savingsDelta)}`;
  }

  if (savingsDelta < -0.009) {
    return `Variazione ${formatPrice(Math.abs(savingsDelta))}`;
  }

  return "Configurazione alternativa";
}

function formatAssignmentPriceLine(assignment: PendingRowAssignment): string {
  if (assignment.quantita > 1) {
    return `${assignment.quantita} × ${formatPrice(assignment.prezzoUnitario)} = ${formatPrice(assignment.prezzoRiga)}`;
  }

  return formatPrice(assignment.prezzoRiga);
}

function describeRowChange(change: PendingRowChange): string {
  if (!change.committed) {
    return "Nuova referenza da aggiungere alla tabella ottimizzata.";
  }

  if (change.committed.ecommerceId !== change.optimal.ecommerceId) {
    return "Cambio negozio consigliato per ridurre il costo complessivo (prodotto + spedizione).";
  }

  if (change.committed.productName !== change.optimal.productName) {
    return "Stesso negozio, prodotto alternativo più conveniente.";
  }

  if (change.committed.quantita !== change.optimal.quantita) {
    return "Stesso prodotto e negozio, quantità diversa nell'ottimo.";
  }

  return "Aggiornamento consigliato su questa referenza.";
}

function PendingAssignmentBlock({
  label,
  assignment,
  tone,
}: {
  label: string;
  assignment: PendingRowAssignment | null;
  tone: "current" | "optimal";
}) {
  const labelClass =
    tone === "current"
      ? "text-zinc-500 dark:text-zinc-400"
      : "text-sky-700 dark:text-sky-300";

  if (!assignment) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>
            {label}
          </p>
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Non presente in tabella
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>
          {label}
        </p>
        <EcommerceLogoBadge
          logoUrl={assignment.ecommerceLogoUrl}
          name={assignment.ecommerceName}
        />
      </div>
      <p className="mt-1 text-sm font-semibold break-words text-zinc-900 dark:text-zinc-100">
        {assignment.productName}
      </p>
      {assignment.brand ? (
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{assignment.brand}</p>
      ) : null}
      <p className="mt-1 text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
        {formatAssignmentPriceLine(assignment)}
      </p>
    </div>
  );
}

function PendingOptimizationDetailsDialog({
  open,
  onOpenChange,
  changes,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: PendingRowChange[];
  summary: PendingOptimizationSummary;
}) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose]);

  const savingsLabel = formatPendingSavingsLabel(summary.savingsDelta);

  const prodottiDelta =
    summary.committed.prezzoProdotti - summary.optimal.prezzoProdotti;
  const spedizioneDelta =
    summary.committed.prezzoSpedizione - summary.optimal.prezzoSpedizione;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Chiudi dettagli"
            className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[1px]"
            onClick={handleClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pending-optimization-dialog-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative flex max-h-[min(85vh,720px)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl dark:border-sky-800 dark:bg-zinc-950 sm:w-[70vw] sm:max-w-[70vw]"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-sky-100 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/40 sm:px-5">
              <div className="min-w-0 pr-2">
                <h4
                  id="pending-optimization-dialog-title"
                  className="text-sm font-semibold text-sky-950 dark:text-sky-100"
                >
                  <span aria-hidden="true">⚡</span> {savingsLabel}
                </h4>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Chiudi"
                className="shrink-0 rounded-lg p-1.5 text-sky-700 transition-colors hover:bg-sky-100 dark:text-sky-200 dark:hover:bg-sky-900/50"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-900/50">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Tabella attuale
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatPrice(summary.committed.prezzoTotale)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    prodotti {formatPrice(summary.committed.prezzoProdotti)} · spedizione{" "}
                    {formatPrice(summary.committed.prezzoSpedizione)}
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50 px-3 py-3 dark:bg-sky-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    Tabella proposta
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-sky-950 dark:text-sky-100">
                    {formatPrice(summary.optimal.prezzoTotale)}
                  </p>
                  <p className="mt-1 text-xs text-sky-800 dark:text-sky-200/80">
                    prodotti {formatPrice(summary.optimal.prezzoProdotti)} · spedizione{" "}
                    {formatPrice(summary.optimal.prezzoSpedizione)}
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-sky-50/70 px-3 py-2.5 text-xs text-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
                <p>
                  {changes.length === 1
                    ? "1 referenza cambierebbe assegnazione."
                    : `${changes.length} referenze cambierebbero assegnazione.`}
                  {Math.abs(prodottiDelta) > 0.009 ? (
                    <>
                      {" "}
                      Prodotti:{" "}
                      {prodottiDelta > 0 ? "−" : "+"}
                      {formatPrice(Math.abs(prodottiDelta))}.
                    </>
                  ) : null}
                  {Math.abs(spedizioneDelta) > 0.009 ? (
                    <>
                      {" "}
                      Spedizione:{" "}
                      {spedizioneDelta > 0 ? "−" : "+"}
                      {formatPrice(Math.abs(spedizioneDelta))}.
                    </>
                  ) : null}
                </p>
              </div>

              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {changes.map((change) => (
                  <li key={change.queryIndex} className="py-4 first:pt-0 last:pb-0">
                    <p className="text-sm font-bold break-words text-zinc-900 dark:text-zinc-100">
                      {change.queryText}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {describeRowChange(change)}
                    </p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <PendingAssignmentBlock
                        label="Attuale"
                        assignment={change.committed}
                        tone="current"
                      />
                      <PendingAssignmentBlock
                        label="Proposta"
                        assignment={change.optimal}
                        tone="optimal"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function PendingOptimizationBanner({
  changes,
  summary,
  onAccept,
  onReject,
}: {
  changes: PendingRowChange[];
  summary: PendingOptimizationSummary;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (changes.length === 0) {
      setDetailsOpen(false);
    }
  }, [changes.length]);

  const savingsLabel = formatPendingSavingsLabel(summary.savingsDelta);

  const handleAccept = () => {
    setDetailsOpen(false);
    onAccept();
  };

  const handleReject = () => {
    setDetailsOpen(false);
    onReject();
  };

  return (
    <>
      <div className="flex h-full w-full items-center gap-2 px-4 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="truncate text-xs font-semibold text-sky-950 dark:text-sky-100">
            <span aria-hidden="true">⚡</span> {savingsLabel}
          </p>
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            className="shrink-0 text-[11px] font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? "chiudi dettagli" : "mostra dettagli"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleReject}
            className="rounded-md border border-sky-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50"
          >
            Rifiuta
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-700"
          >
            Applica
          </button>
        </div>
      </div>

      <PendingOptimizationDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        changes={changes}
        summary={summary}
      />
    </>
  );
}

export function ScenarioCard({
  scenario,
  catalogById,
  tiersByEcommerce,
  queryIndexByOffertaId,
  onNavigateToReferenza,
  onQuantityChange,
  onRemoveReferenza,
  isRemovingReferenza = false,
  canRemoveReferenza = false,
  onOpenAddReferenza,
  isAddingReferenza = false,
  showPendingOptimization = false,
  pendingChanges = [],
  pendingSummary,
  onAcceptPending,
  onRejectPending,
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
  onRemoveReferenza?: (queryIndex: number) => void;
  isRemovingReferenza?: boolean;
  canRemoveReferenza?: boolean;
  onOpenAddReferenza?: () => void;
  isAddingReferenza?: boolean;
  showPendingOptimization?: boolean;
  pendingChanges?: PendingRowChange[];
  pendingSummary?: PendingOptimizationSummary;
  onAcceptPending?: () => void;
  onRejectPending?: () => void;
}) {
  const [deleteArmedIndex, setDeleteArmedIndex] = useState<number | null>(null);
  const prevRemovingReferenza = useRef(isRemovingReferenza);

  useEffect(() => {
    if (prevRemovingReferenza.current && !isRemovingReferenza) {
      setDeleteArmedIndex(null);
    }
    prevRemovingReferenza.current = isRemovingReferenza;
  }, [isRemovingReferenza]);

  const pendingQueryIndexes = new Set(
    showPendingOptimization
      ? pendingChanges.map((change) => change.queryIndex)
      : []
  );

  const handleTrashClick = (queryIndex: number) => {
    if (!onRemoveReferenza || !canRemoveReferenza || isRemovingReferenza) {
      return;
    }

    if (deleteArmedIndex === queryIndex) {
      onRemoveReferenza(queryIndex);
      return;
    }

    setDeleteArmedIndex(queryIndex);
  };

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
          {showPendingOptimization ? (
            <span
              className="ml-1.5 text-base"
              title="Suggerimenti di ottimizzazione disponibili"
              aria-hidden="true"
            >
              ⚡
            </span>
          ) : null}
        </p>
      </header>

      <div
        className={`flex h-9 shrink-0 items-center overflow-hidden ${
          showPendingOptimization &&
          pendingSummary &&
          onAcceptPending &&
          onRejectPending
            ? "bg-sky-50 dark:bg-sky-950/30"
            : ""
        }`}
        aria-live="polite"
      >
        {showPendingOptimization &&
        pendingSummary &&
        onAcceptPending &&
        onRejectPending ? (
          <PendingOptimizationBanner
            changes={pendingChanges}
            summary={pendingSummary}
            onAccept={onAcceptPending}
            onReject={onRejectPending}
          />
        ) : null}
      </div>

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
                <EcommerceLogoBadge
                  logoUrl={ecom?.logo_url}
                  name={ecom?.ecommerce_name ?? ecomId}
                />
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
                      className="inline-flex max-w-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-light leading-snug text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      ancora {formatPrice(hint.gap)} per{" "}
                      {formatPrice(hint.targetShipping)} di spedizione
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                {voci.map((voce) => {
                  const queryIndex = queryIndexByOffertaId.get(voce.offerta.id);
                  const showPendingMarker =
                    queryIndex != null && pendingQueryIndexes.has(queryIndex);

                  return (
                  <li
                    key={voce.offerta.id}
                    className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4 sm:gap-y-1"
                  >
                    <ScenarioProductBadge
                      productName={voce.offerta.product_name}
                      brand={voce.offerta.brand}
                      url={voce.offerta.original_url?.trim() || null}
                      quantita={voce.quantita}
                      showPendingMarker={showPendingMarker}
                      priceNode={
                        voce.quantita > 1 ? (
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
                        )
                      }
                      onNavigateToReferenza={
                        onNavigateToReferenza && queryIndex != null
                          ? () => onNavigateToReferenza(queryIndex)
                          : undefined
                      }
                      onQuantityChange={
                        onQuantityChange && queryIndex != null
                          ? (next) => {
                              onQuantityChange({
                                queryIndex,
                                ecommerceId: ecomId,
                                offertaId: voce.offerta.id,
                                next,
                              });
                            }
                          : undefined
                      }
                      onRemoveClick={
                        onRemoveReferenza &&
                        canRemoveReferenza &&
                        queryIndex != null
                          ? () => handleTrashClick(queryIndex)
                          : undefined
                      }
                      isRemoveArmed={deleteArmedIndex === queryIndex}
                      isRemoving={
                        isRemovingReferenza && deleteArmedIndex === queryIndex
                      }
                    />
                  </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {onOpenAddReferenza ? (
          <div className="mt-4 flex justify-start">
            <button
              type="button"
              onClick={() => {
                setDeleteArmedIndex(null);
                onOpenAddReferenza();
              }}
              disabled={isAddingReferenza}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-light text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              aggiungi nuovo prodotto 🔎
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
