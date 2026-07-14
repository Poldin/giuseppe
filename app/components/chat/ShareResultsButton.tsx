"use client";

import { useState } from "react";

const buttonClassName =
  "w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800";

export function ShareResultsButton({
  className = buttonClassName,
}: {
  className?: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleShare = async () => {
    const url = window.location.href;
    const shareData: ShareData = {
      title: "Giuseppe - Risultati confronto",
      text: "Guarda il confronto prezzi che ho fatto con Giuseppe",
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
      await navigator.clipboard.writeText(url);
      setFeedback("Link copiato");
      window.setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback("Condivisione non disponibile");
      window.setTimeout(() => setFeedback(null), 2500);
    }
  };

  return (
    <button type="button" onClick={() => void handleShare()} className={className}>
      {feedback ?? "Condividi confronto"}
    </button>
  );
}
