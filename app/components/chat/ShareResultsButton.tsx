"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown, FileDown, FileText, Share2 } from "lucide-react";

import type {
  ScenarioCarrello,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari";
import type { ShippingTier } from "@/app/lib/search/shipping-cost";
import {
  buildMatchShareText,
  buildScenarioExportDocument,
  buildScenarioExportFilename,
  exportDocumentToText,
  type ScenarioExportDocument,
} from "@/app/lib/search/scenario-export";

const buttonClassName =
  "w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800";

const menuItemClassName =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-zinc-800";

export { buildMatchShareText, buildScenarioInfoText } from "@/app/lib/search/scenario-export";

export function ShareResultsButton({
  className = buttonClassName,
  shareText = "Guarda il confronto prezzi che ho fatto con Giuseppe",
  chatId,
  exportDocument,
}: {
  className?: string;
  shareText?: string;
  chatId?: string;
  exportDocument?: ScenarioExportDocument;
}) {
  const hasExportMenu = Boolean(chatId && exportDocument);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.document.addEventListener("mousedown", handlePointerDown);
    window.document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.document.removeEventListener("mousedown", handlePointerDown);
      window.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const showFeedback = (message: string, ms = 2000) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(null), ms);
  };

  const handleShare = async () => {
    setMenuOpen(false);
    setFeedback(null);

    const url = window.location.href;
    const shareData: ShareData = {
      title: "Giuseppe - Risultati confronto",
      text: shareText,
      url,
    };

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
      showFeedback("Link copiato");
    } catch {
      showFeedback("Condivisione non disponibile", 2500);
    }
  };

  const handleCopy = async () => {
    if (!exportDocument) return;
    setMenuOpen(false);
    setFeedback(null);

    try {
      await navigator.clipboard.writeText(exportDocumentToText(exportDocument));
      showFeedback("Info copiate");
    } catch {
      showFeedback("Copia non disponibile", 2500);
    }
  };

  const handleDownloadPdf = async () => {
    if (!chatId || !exportDocument) return;
    setMenuOpen(false);
    setFeedback(null);
    setIsDownloading(true);

    try {
      const response = await fetch(`/api/chat/${chatId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pdf", document: exportDocument }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Download non disponibile");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const matchedName = disposition?.match(/filename="([^"]+)"/)?.[1];
      const filename =
        matchedName ?? buildScenarioExportFilename(exportDocument, "pdf");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showFeedback("PDF scaricato");
    } catch (error) {
      showFeedback(
        error instanceof Error ? error.message : "Download non disponibile",
        2500
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (!hasExportMenu) {
    return (
      <button type="button" onClick={() => void handleShare()} className={className}>
        {feedback ?? "Condividi"}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative w-fit">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={isDownloading}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`${className} inline-flex items-center gap-1.5`}
      >
        {feedback ?? (isDownloading ? "Download..." : "Condividi")}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 z-40 mt-1.5 min-w-46 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleShare()}
            className={menuItemClassName}
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Condividi link
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopy()}
            className={menuItemClassName}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Copia testo
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleDownloadPdf()}
            disabled={isDownloading}
            className={menuItemClassName}
          >
            <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Scarica PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RichiestaSummary({
  prodottiRichiesti,
  onNavigateToReferenza,
}: {
  prodottiRichiesti: string[];
  onNavigateToReferenza?: (queryIndex: number) => void;
}) {
  if (prodottiRichiesti.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Richiesta
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {prodottiRichiesti.map((prodotto, index) => (
          <li
            key={`${index}-${prodotto}`}
            className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
          >
            <span className="shrink-0 leading-5" aria-hidden="true">
              🔍
            </span>
            {onNavigateToReferenza ? (
              <button
                type="button"
                onClick={() => onNavigateToReferenza(index)}
                className="min-w-0 break-words text-left leading-5 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {prodotto}
              </button>
            ) : (
              <span className="min-w-0 break-words leading-5">{prodotto}</span>
            )}
            {onNavigateToReferenza ? (
              <button
                type="button"
                onClick={() => onNavigateToReferenza(index)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs font-light text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                aria-label={`Vai al confronto di ${prodotto}`}
              >
                vedi
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChatShareActions({
  chatId,
  scenario,
  catalogById,
  tiersByEcommerce,
  prodottiRichiesti,
}: {
  chatId: string;
  scenario: ScenarioCarrello;
  catalogById: Record<string, TabellaEcommerce>;
  tiersByEcommerce: Record<string, ShippingTier[]>;
  prodottiRichiesti: string[];
}) {
  const shareText = buildMatchShareText(scenario);
  const exportDocument = buildScenarioExportDocument(
    scenario,
    catalogById,
    tiersByEcommerce,
    prodottiRichiesti,
    typeof window !== "undefined" ? window.location.href : undefined
  );

  return (
    <ShareResultsButton
      shareText={shareText}
      chatId={chatId}
      exportDocument={exportDocument}
    />
  );
}
