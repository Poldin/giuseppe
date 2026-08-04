"use client";

/**
 * Confronto offerte su /pub — solo umani, on-demand.
 * Nessuna RPC axe al mount: parte solo dopo click (click-to-compare).
 * I crawler ricevono già HTML ISR; l’API risponde vuota ai bot.
 */
import {
  InlineProductMatchRow,
  type InlineProductRowStatus,
} from "@/app/components/home/InlineProductMatchRow";
import { GiuseppeCompareCta } from "@/app/components/layout/GiuseppeCompareCta";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";
import { useCallback, useEffect, useRef, useState } from "react";

type ComparePhase = "idle" | "loading" | "ready" | "empty" | "error";

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

function toRowStatus(phase: ComparePhase): InlineProductRowStatus {
  if (phase === "idle") return "empty";
  return phase;
}

export function PubInlineComparison({ productName }: { productName: string }) {
  const query = productName.trim();
  const [phase, setPhase] = useState<ComparePhase>("idle");
  const [matches, setMatches] = useState<InlineMatchCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setMatches([]);
    setSelectedId(null);
    setQuantities({});
    setExpanded(true);
  }, [query]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runCompare = useCallback(() => {
    if (query.length < 2) {
      setPhase("empty");
      setMatches([]);
      setSelectedId(null);
      setQuantities({});
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("loading");
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
        if (controller.signal.aborted) return;
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
        setPhase(nextMatches.length > 0 ? "ready" : "empty");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("pub inline match failed:", error);
        setPhase("error");
        setMatches([]);
        setSelectedId(null);
        setQuantities({});
      });
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

      {phase === "idle" ? (
        <button
          type="button"
          onClick={runCompare}
          className="flex w-full items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Confronta prezzi su altri shop
        </button>
      ) : (
        <ul className="flex flex-col gap-2">
          <InlineProductMatchRow
            query={query}
            status={toRowStatus(phase)}
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
            onRetry={phase === "error" ? runCompare : undefined}
          />
        </ul>
      )}

      <GiuseppeCompareCta className="mt-5" />
    </section>
  );
}
