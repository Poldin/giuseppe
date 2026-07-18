"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { useState } from "react";

export function PubProductActions({
  productName,
  productUrl,
  ecommerceName,
}: {
  productName: string;
  productUrl: string | null;
  ecommerceName: string | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    const trimmed = productName.trim();
    if (!trimmed || isSubmitting) return;

    // Open immediately (sync with click) so the new tab is real and this tab stays on /pub.
    // Note: window.open(..., "noopener") often returns null even when a tab opened — don't use that as a fallback signal.
    const newTab = window.open("about:blank", "_blank");
    if (newTab) {
      newTab.opener = null;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: [trimmed],
          queryText: trimmed,
        }),
      });

      const payload = (await response.json()) as {
        chatId?: string;
        error?: string;
      };

      if (!response.ok || !payload.chatId) {
        throw new Error(payload.error ?? "Errore durante il confronto");
      }

      const chatUrl = `/chat/${payload.chatId}`;
      if (newTab) {
        newTab.location.href = chatUrl;
      } else {
        // Popup blocked: only then navigate this tab.
        window.location.assign(chatUrl);
      }
    } catch (submitError) {
      if (newTab && !newTab.closed) {
        newTab.close();
      }
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Errore durante il confronto"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void handleCompare()}
        disabled={isSubmitting || !productName.trim()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Confronto in corso...
          </>
        ) : (
          "Esegui confronto prezzi"
        )}
      </button>

      {productUrl ? (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-3.5 text-center text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Vedi su {ecommerceName?.trim() || "rivenditore"}
          <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </a>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
