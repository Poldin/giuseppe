"use client";

import { Share2 } from "lucide-react";
import { useCallback, useState } from "react";

const SRC_PARAM = "src";

const defaultClassName =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white";

const iconClassName =
  "inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 p-1.5 text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white";

async function shareHomesearchSession(): Promise<"shared" | "copied"> {
  let sessionId: string | null = null;
  if (typeof window !== "undefined") {
    sessionId = new URL(window.location.href).searchParams.get(SRC_PARAM);
  }

  if (!sessionId) {
    const response = await fetch("/api/homesearch/session", { method: "POST" });
    const payload = (await response.json()) as {
      sessionId?: string;
      error?: string;
    };
    if (!response.ok || !payload.sessionId) {
      throw new Error(payload.error ?? "Impossibile creare la sessione");
    }
    sessionId = payload.sessionId;
    const url = new URL(window.location.href);
    url.searchParams.set(SRC_PARAM, sessionId);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  const shareUrl = new URL(window.location.href);
  shareUrl.searchParams.set(SRC_PARAM, sessionId);
  const href = shareUrl.toString();
  const shareText =
    "Guarda la ricerca prodotti che ho preparato con Giuseppe";
  const shareData: ShareData = {
    title: "Giuseppe - Ricerca prodotti",
    text: shareText,
    url: href,
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return "shared";
      }
    }
  }

  await navigator.clipboard.writeText(`${shareText}\n${href}`);
  return "copied";
}

export function HomeShareButton({
  className = "",
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    setFeedback(null);

    try {
      const result = await shareHomesearchSession();
      if (result === "copied") {
        setFeedback(iconOnly ? "✓" : "Link copiato");
        window.setTimeout(() => setFeedback(null), 2000);
      }
    } catch (shareError) {
      console.error("home share failed:", shareError);
      setFeedback(iconOnly ? "!" : "Non disponibile");
      window.setTimeout(() => setFeedback(null), 2500);
    }
  }, [iconOnly]);

  const base = iconOnly ? iconClassName : defaultClassName;

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      aria-label={feedback === "✓" ? "Link copiato" : "Condividi ricerca"}
      title={feedback === "✓" ? "Link copiato" : "Condividi"}
      className={className ? `${base} ${className}` : base}
    >
      {iconOnly ? (
        feedback === "✓" || feedback === "!" ? (
          <span className="flex h-3 w-3 items-center justify-center text-[10px] font-bold leading-none">
            {feedback}
          </span>
        ) : (
          <Share2 size={12} aria-hidden />
        )
      ) : (
        <>
          <Share2 size={12} aria-hidden />
          {feedback ?? "Condividi"}
        </>
      )}
    </button>
  );
}
