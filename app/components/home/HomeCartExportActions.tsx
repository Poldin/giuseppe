"use client";

import {
  buildCartExportDocument,
  buildScenarioExportFilename,
  exportCartDocumentToText,
} from "@/app/lib/search/scenario-export";
import { Copy, FileDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type CartLineForExport = {
  productName: string;
  brand: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  query: string;
  originalUrl: string | null;
};

type CartGroupForExport = {
  ecommerceId: string;
  ecommerceName: string;
  subtotal: number;
  shipping: number;
  total: number;
  lines: CartLineForExport[];
};

const exportButtonClassName =
  "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to legacy path (common on some mobile browsers)
    }
  }

  const textarea = window.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  window.document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const ok = window.document.execCommand("copy");
  textarea.remove();
  if (!ok) {
    throw new Error("Copia non disponibile");
  }
}

function toExportDocument(groups: CartGroupForExport[]) {
  const pageUrl =
    typeof window !== "undefined" ? window.location.href : undefined;
  return buildCartExportDocument(
    groups.map((group) => ({
      ecommerceId: group.ecommerceId,
      ecommerceName: group.ecommerceName,
      subtotal: group.subtotal,
      shipping: group.shipping,
      total: group.total,
      lines: group.lines.map((line) => ({
        productName: line.productName,
        brand: line.brand,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        query: line.query,
        originalUrl: line.originalUrl,
      })),
    })),
    pageUrl
  );
}

export function HomeCartExportActions({
  groupsWithShipping,
}: {
  groupsWithShipping: CartGroupForExport[];
}) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const pdfTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      if (pdfTimerRef.current != null) window.clearTimeout(pdfTimerRef.current);
    };
  }, []);

  const showCopyFeedback = useCallback((message: string, ms = 2000) => {
    setCopyFeedback(message);
    if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyFeedback(null), ms);
  }, []);

  const showPdfFeedback = useCallback((message: string, ms = 2000) => {
    setPdfFeedback(message);
    if (pdfTimerRef.current != null) window.clearTimeout(pdfTimerRef.current);
    pdfTimerRef.current = window.setTimeout(() => setPdfFeedback(null), ms);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(
        exportCartDocumentToText(toExportDocument(groupsWithShipping))
      );
      showCopyFeedback("Copiato");
    } catch {
      showCopyFeedback("Errore", 2500);
    }
  }, [groupsWithShipping, showCopyFeedback]);

  const handleDownloadPdf = useCallback(async () => {
    setIsDownloading(true);
    setPdfFeedback(null);

    try {
      const document = toExportDocument(groupsWithShipping);
      const response = await fetch("/api/homesearch/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "pdf", document }),
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
        matchedName ?? buildScenarioExportFilename(document, "pdf");
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      showPdfFeedback("Scaricato");
    } catch (error) {
      console.error("cart pdf export failed:", error);
      showPdfFeedback("Errore", 2500);
    } finally {
      setIsDownloading(false);
    }
  }, [groupsWithShipping, showPdfFeedback]);

  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-live="polite"
        aria-label={copyFeedback ?? "Copia testo"}
        title={copyFeedback ?? "Copia testo"}
        className={exportButtonClassName}
      >
        {copyFeedback ? (
          copyFeedback
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            testo
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => void handleDownloadPdf()}
        disabled={isDownloading}
        aria-live="polite"
        aria-label={
          pdfFeedback ??
          (isDownloading ? "Download in corso" : "Scarica PDF")
        }
        title={pdfFeedback ?? "Scarica PDF"}
        className={exportButtonClassName}
      >
        {pdfFeedback ? (
          pdfFeedback
        ) : isDownloading ? (
          "..."
        ) : (
          <>
            <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            pdf
          </>
        )}
      </button>
    </div>
  );
}
