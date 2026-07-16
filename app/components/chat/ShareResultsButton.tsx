"use client";

import { useState } from "react";

import { calcolaSpedizione, type ShippingTier } from "@/app/lib/search/shipping-cost";
import type {
  ScenarioCarrello,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari";

const buttonClassName =
  "w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800";

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatScenarioSummary(
  copertura: number,
  coperturaTotale: number,
  prezzoProdotti: number,
  prezzoSpedizione: number
): string {
  const spedizioneLabel =
    prezzoSpedizione > 0
      ? `spedizione ${formatPrice(prezzoSpedizione)}`
      : "spedizione 0 €";

  return `${copertura}/${coperturaTotale} referenze · prodotti ${formatPrice(prezzoProdotti)} · ${spedizioneLabel}`;
}

export function buildMatchShareText(scenario: ScenarioCarrello): string {
  return `match migliore: ${formatScenarioSummary(
    scenario.copertura,
    scenario.copertura_totale,
    scenario.prezzo_prodotti,
    scenario.prezzo_spedizione
  )} -> totale ${formatPrice(scenario.prezzo_totale)}`;
}

export function buildScenarioInfoText(
  scenario: ScenarioCarrello,
  catalogById: Record<string, TabellaEcommerce>,
  tiersByEcommerce: Record<string, ShippingTier[]>,
  pageUrl?: string
): string {
  const lines: string[] = [
    scenario.titolo,
    buildMatchShareText(scenario),
    "",
  ];

  for (const [ecomId, voci] of Object.entries(scenario.ordini)) {
    const ecom = catalogById[ecomId];
    const ecommerceName = ecom?.ecommerce_name ?? ecomId;
    const prezzoProdottiEcom = voci.reduce(
      (sum, voce) => sum + voce.prezzo_riga,
      0
    );
    const prezzoSpedizioneEcom = calcolaSpedizione(
      prezzoProdottiEcom,
      tiersByEcommerce[ecomId] ?? []
    );
    const totaleParziale = prezzoProdottiEcom + prezzoSpedizioneEcom;

    lines.push(`${ecommerceName} — ${formatPrice(totaleParziale)}`);
    lines.push(
      formatScenarioSummary(
        voci.length,
        scenario.copertura_totale,
        prezzoProdottiEcom,
        prezzoSpedizioneEcom
      )
    );

    for (const voce of voci) {
      const priceLine =
        voce.quantita > 1
          ? `${voce.quantita} × ${formatPrice(voce.offerta.prezzo)} = ${formatPrice(voce.prezzo_riga)}`
          : formatPrice(voce.prezzo_riga);
      const brand = voce.offerta.brand?.trim();
      const name = brand
        ? `${voce.offerta.product_name} (${brand})`
        : voce.offerta.product_name;

      lines.push(`• ${name} — ${priceLine}`);

      const url = voce.offerta.original_url?.trim();
      if (url) {
        lines.push(`  ${url}`);
      }
    }

    lines.push("");
  }

  if (pageUrl) {
    lines.push(`Trovi tutto al link: ${pageUrl}`);
  }

  lines.push("");
  lines.push(
    "sono GIUSEPPE ❤️‍🔥 confronto prezzi e prodotti su +100K articoli odontoiatrici"
  );

  return lines.join("\n").trim();
}

export function ShareResultsButton({
  className = buttonClassName,
  shareText = "Guarda il confronto prezzi che ho fatto con Giuseppe",
}: {
  className?: string;
  shareText?: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData: ShareData = {
      title: "Giuseppe - Risultati confronto",
      text: shareText,
      url,
    };

    setFeedback(null);

    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`);
      setFeedback("Link copiato");
      window.setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback("Condivisione non disponibile");
      window.setTimeout(() => setFeedback(null), 2500);
    }
  };

  return (
    <button type="button" onClick={() => void handleShare()} className={className}>
      {feedback ?? "Condividi"}
    </button>
  );
}

export function CopyInfoButton({
  className = buttonClassName,
  infoText,
}: {
  className?: string;
  infoText: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCopy = async () => {
    setFeedback(null);

    try {
      await navigator.clipboard.writeText(infoText);
      setFeedback("Info copiate");
      window.setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback("Copia non disponibile");
      window.setTimeout(() => setFeedback(null), 2500);
    }
  };

  return (
    <button type="button" onClick={() => void handleCopy()} className={className}>
      {feedback ?? "Copia info"}
    </button>
  );
}

export function ChatShareActions({
  scenario,
  catalogById,
  tiersByEcommerce,
}: {
  scenario: ScenarioCarrello;
  catalogById: Record<string, TabellaEcommerce>;
  tiersByEcommerce: Record<string, ShippingTier[]>;
}) {
  const shareText = buildMatchShareText(scenario);
  const infoText = buildScenarioInfoText(
    scenario,
    catalogById,
    tiersByEcommerce,
    typeof window !== "undefined" ? window.location.href : undefined
  );

  return (
    <>
      <ShareResultsButton shareText={shareText} />
      <CopyInfoButton infoText={infoText} />
    </>
  );
}
