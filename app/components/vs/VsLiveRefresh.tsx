"use client";

import type { VsCombination } from "@/app/lib/vs/combination";
import { useEffect, useState } from "react";

/**
 * Per umani: refresh prezzi/spedizione dal DB.
 * I crawler ricevono già l’HTML ISR; l’API live risponde vuota ai bot.
 */
export function VsLiveRefresh({
  slug,
  onUpdate,
}: {
  slug: string;
  onUpdate: (next: VsCombination) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");

    void fetch(`/api/vs/live?slug=${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as {
          combination?: VsCombination | null;
        };
        return data.combination ?? null;
      })
      .then((next) => {
        if (cancelled) return;
        if (next) {
          onUpdate(next);
          setStatus("done");
        } else {
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Solo slug: refresh una volta per navigazione umana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (status === "loading") {
    return (
      <p className="mt-2 text-xs text-zinc-400" aria-live="polite">
        Aggiornamento prezzi…
      </p>
    );
  }

  return null;
}
