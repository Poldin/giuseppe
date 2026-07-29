"use client";

/**
 * Confronto offerte su /pub — solo umani.
 * I crawler ricevono già HTML ISR (prezzo, FAQ, JSON-LD); questa strip
 * parte in client e l’API inline-match risponde vuota ai bot.
 */
import {
  InlineProductMatchRow,
  type InlineProductRowStatus,
} from "@/app/components/home/InlineProductMatchRow";
import { GiuseppeCompareCta } from "@/app/components/layout/GiuseppeCompareCta";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";
import { useEffect, useState } from "react";

function buildQuantities(
  matches: InlineMatchCandidate[],
  previous: Record<string, number> = {}
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const match of matches) {
    next[match.id] = Math.max(1, previous[match.id] ?? 1);
  }
  return next;
}

export function PubInlineComparison({ productName }: { productName: string }) {
  const query = productName.trim();
  const [status, setStatus] = useState<InlineProductRowStatus>("loading");
  const [matches, setMatches] = useState<InlineMatchCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (query.length < 2) {
      setStatus("empty");
      setMatches([]);
      setSelectedId(null);
      setQuantities({});
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setStatus("loading");
    setMatches([]);
    setSelectedId(null);
    setQuantities({});
    setExpanded(true);

    void fetch("/api/products/inline-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          matches?: InlineMatchCandidate[];
          selectedId?: string | null;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Errore durante il confronto");
        }
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const nextMatches = Array.isArray(payload.matches)
          ? payload.matches
          : [];
        const nextSelected =
          typeof payload.selectedId === "string"
            ? payload.selectedId
            : nextMatches[0]?.id ?? null;
        setMatches(nextMatches);
        setSelectedId(nextSelected);
        setQuantities(buildQuantities(nextMatches));
        setStatus(nextMatches.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return;
        console.error("pub inline match failed:", error);
        setStatus("error");
        setMatches([]);
        setSelectedId(null);
        setQuantities({});
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query]);

  if (!query) return null;

  return (
    <section
      className="mt-10"
      aria-labelledby="confronta-altre-offerte-heading"
    >
      <h2
        id="confronta-altre-offerte-heading"
        className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500"
      >
        Confronta altre offerte
      </h2>

      <ul className="flex flex-col gap-2">
        <InlineProductMatchRow
          query={query}
          status={status}
          matches={matches}
          selectedId={selectedId}
          quantities={quantities}
          expanded={expanded}
          showRemove={false}
          onToggleExpanded={() => setExpanded((value) => !value)}
          onSelectMatch={setSelectedId}
          onQuantityChange={(matchId, next) => {
            setQuantities((current) => ({
              ...current,
              [matchId]: Math.max(1, next),
            }));
          }}
        />
      </ul>

      <GiuseppeCompareCta className="mt-5" />
    </section>
  );
}
