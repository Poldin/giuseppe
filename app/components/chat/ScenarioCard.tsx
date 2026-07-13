"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react";

import { AddReferenzaInlineRow } from "@/app/components/chat/TopMatchPerReferenzaSection";

import { QuantityControl } from "@/app/components/chat/QuantityControl";
import {
  buildShippingHints,
  calcolaSpedizione,
  type ShippingTier,
} from "@/app/lib/search/shipping-cost";
import type {
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

function ScenarioProductBadge({
  productName,
  brand,
  url,
  quantita,
  onNavigateToReferenza,
  onQuantityChange,
  onRemoveClick,
  isRemoveArmed = false,
  isRemoving = false,
}: {
  productName: string;
  brand?: string | null;
  url: string | null;
  quantita: number;
  onNavigateToReferenza?: () => void;
  onQuantityChange?: (next: number) => void;
  onRemoveClick?: () => void;
  isRemoveArmed?: boolean;
  isRemoving?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 items-start gap-1.5">
        {onRemoveClick ? (
          <button
            type="button"
            onClick={onRemoveClick}
            disabled={isRemoving}
            aria-label={
              isRemoveArmed
                ? "Conferma eliminazione referenza"
                : "Elimina referenza"
            }
            className={`mt-0.5 shrink-0 rounded-md p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              isRemoveArmed
                ? "bg-red-600 text-white hover:bg-red-700"
                : "font-light text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
            }`}
          >
            {isRemoving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
        ) : null}

        {onNavigateToReferenza ? (
          <button
            type="button"
            onClick={onNavigateToReferenza}
            className="inline-block w-fit max-w-full rounded-md bg-white px-2 py-1 text-left text-md font-bold leading-snug break-words text-zinc-700 transition-colors hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100"
          >
            {productName}
          </button>
        ) : (
          <span className="inline-block w-fit max-w-full rounded-md bg-white px-2 py-1 text-xs font-bold leading-snug break-words text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            {productName}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
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
  onAddReferenza,
  isAddingReferenza = false,
  addReferenzaError = null,
  addReferenzaAfterIndex,
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
  onAddReferenza?: (insertAfterIndex: number, productName: string) => void;
  isAddingReferenza?: boolean;
  addReferenzaError?: string | null;
  addReferenzaAfterIndex?: number;
}) {
  const [deleteArmedIndex, setDeleteArmedIndex] = useState<number | null>(null);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const prevRemovingReferenza = useRef(isRemovingReferenza);
  const prevAddingReferenza = useRef(isAddingReferenza);

  useEffect(() => {
    if (prevRemovingReferenza.current && !isRemovingReferenza) {
      setDeleteArmedIndex(null);
    }
    prevRemovingReferenza.current = isRemovingReferenza;
  }, [isRemovingReferenza]);

  useEffect(() => {
    if (prevAddingReferenza.current && !isAddingReferenza && !addReferenzaError) {
      setIsAddingOpen(false);
    }
    prevAddingReferenza.current = isAddingReferenza;
  }, [isAddingReferenza, addReferenzaError]);

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
        </p>
      </header>

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
                <div className="inline-flex h-6 max-w-full items-center rounded-md bg-white px-2 py-0.5 ring-1 ring-zinc-100 dark:ring-zinc-800">
                  {ecom?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ecom.logo_url}
                      alt={ecom.ecommerce_name}
                      className="h-full w-auto max-w-28 object-contain object-left"
                    />
                  ) : (
                    <span className="text-xs font-bold uppercase text-zinc-600">
                      {(ecom?.ecommerce_name ?? ecomId).slice(0, 2)}
                    </span>
                  )}
                </div>
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
                      className="inline-flex max-w-full rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium leading-snug text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      ancora {formatPrice(hint.gap)} per{" "}
                      {formatPrice(hint.targetShipping)} di spedizione
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="space-y-2">
                {voci.map((voce) => {
                  const queryIndex = queryIndexByOffertaId.get(voce.offerta.id);

                  return (
                  <li
                    key={voce.offerta.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 sm:items-center sm:gap-x-4"
                  >
                    <ScenarioProductBadge
                      productName={voce.offerta.product_name}
                      brand={voce.offerta.brand}
                      url={voce.offerta.original_url?.trim() || null}
                      quantita={voce.quantita}
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
                    <div className="shrink-0 self-center text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      {voce.quantita > 1 ? (
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
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {onAddReferenza && addReferenzaAfterIndex != null ? (
          isAddingOpen ? (
            <AddReferenzaInlineRow
              onConfirm={(productName) => {
                onAddReferenza(addReferenzaAfterIndex, productName);
              }}
              onCancel={() => setIsAddingOpen(false)}
              isSubmitting={isAddingReferenza}
              error={addReferenzaError}
            />
          ) : (
            <div className="mt-4 flex justify-start">
              <button
                type="button"
                onClick={() => {
                  setIsAddingOpen(true);
                  setDeleteArmedIndex(null);
                }}
                disabled={isAddingReferenza}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                aggiungi prodotto 🔎
              </button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
