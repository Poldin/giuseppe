"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  InlineProductMatchRow,
  type InlineProductRowStatus,
} from "@/app/components/home/InlineProductMatchRow";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";
import { RecentSearchesStrip } from "@/app/components/home/RecentSearchesStrip";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";

const MAX_PRODUCTS = 20;
/** One inline-match at a time; queued rows still show the loading UI. */
const MAX_CONCURRENT_MATCHES = 1;

type ProductRow = {
  id: string;
  query: string;
  status: InlineProductRowStatus;
  matches: InlineMatchCandidate[];
  selectedId: string | null;
  expanded: boolean;
};

type QueuedMatch = {
  rowId: string;
  productName: string;
};

function createRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function HomeSearchBox({
  recentProducts = [],
}: {
  recentProducts?: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useRef<ProductRow[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const matchQueueRef = useRef<QueuedMatch[]>([]);
  const activeMatchCountRef = useRef(0);
  const runMatchRef = useRef<(rowId: string, productName: string) => Promise<void>>(
    async () => undefined
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    return () => {
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
      abortControllersRef.current.clear();
      matchQueueRef.current = [];
      activeMatchCountRef.current = 0;
    };
  }, []);

  const pumpMatchQueue = useCallback(() => {
    while (
      activeMatchCountRef.current < MAX_CONCURRENT_MATCHES &&
      matchQueueRef.current.length > 0
    ) {
      const next = matchQueueRef.current.shift();
      if (!next) break;

      // Row was removed while waiting in queue.
      if (!rowsRef.current.some((row) => row.id === next.rowId)) {
        continue;
      }

      activeMatchCountRef.current += 1;
      void runMatchRef.current(next.rowId, next.productName).finally(() => {
        activeMatchCountRef.current = Math.max(0, activeMatchCountRef.current - 1);
        pumpMatchQueue();
      });
    }
  }, []);

  const enqueueInlineMatch = useCallback(
    (rowId: string, productName: string) => {
      matchQueueRef.current = matchQueueRef.current.filter((item) => item.rowId !== rowId);
      matchQueueRef.current.push({ rowId, productName });
      pumpMatchQueue();
    },
    [pumpMatchQueue]
  );

  const runInlineMatch = useCallback(async (rowId: string, productName: string) => {
    const existing = abortControllersRef.current.get(rowId);
    existing?.abort();

    const controller = new AbortController();
    abortControllersRef.current.set(rowId, controller);

    try {
      const response = await fetch("/api/products/inline-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: productName }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        matches?: InlineMatchCandidate[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Errore durante il confronto");
      }

      const matches = Array.isArray(payload.matches) ? payload.matches : [];

      setRows((current) =>
        current.map((row) => {
          if (row.id !== rowId) return row;
          return {
            ...row,
            status: matches.length > 0 ? "ready" : "empty",
            matches,
            selectedId: matches[0]?.id ?? null,
          };
        })
      );
    } catch (fetchError) {
      if (controller.signal.aborted) return;

      setRows((current) =>
        current.map((row) =>
          row.id === rowId ? { ...row, status: "error", matches: [], selectedId: null } : row
        )
      );
      console.error("Inline match failed:", fetchError);
    } finally {
      if (abortControllersRef.current.get(rowId) === controller) {
        abortControllersRef.current.delete(rowId);
      }
    }
  }, []);

  useEffect(() => {
    runMatchRef.current = runInlineMatch;
  }, [runInlineMatch]);

  const addProduct = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const current = rowsRef.current;
      const exists = current.some(
        (row) => row.query.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists || current.length >= MAX_PRODUCTS) {
        setQuery("");
        setError(null);
        return;
      }

      const rowId = createRowId();
      const nextRow: ProductRow = {
        id: rowId,
        query: trimmed,
        status: "loading",
        matches: [],
        selectedId: null,
        expanded: false,
      };

      // Keep ref in sync immediately so rapid successive adds see each other.
      rowsRef.current = [...current, nextRow];
      setRows(rowsRef.current);
      enqueueInlineMatch(rowId, trimmed);

      setQuery("");
      setError(null);
    },
    [enqueueInlineMatch]
  );

  const removeProduct = useCallback(
    (rowId: string) => {
      const controller = abortControllersRef.current.get(rowId);
      controller?.abort();
      abortControllersRef.current.delete(rowId);
      matchQueueRef.current = matchQueueRef.current.filter((item) => item.rowId !== rowId);

      rowsRef.current = rowsRef.current.filter((row) => row.id !== rowId);
      setRows(rowsRef.current);
      pumpMatchQueue();
    },
    [pumpMatchQueue]
  );

  const clearAllProducts = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    matchQueueRef.current = [];
    activeMatchCountRef.current = 0;
    rowsRef.current = [];
    setRows([]);
    setError(null);
  }, []);

  const toggleExpanded = useCallback((rowId: string) => {
    setRows((current) => {
      const next = current.map((row) =>
        row.id === rowId ? { ...row, expanded: !row.expanded } : row
      );
      rowsRef.current = next;
      return next;
    });
  }, []);

  const selectMatch = useCallback((rowId: string, matchId: string) => {
    setRows((current) => {
      const next = current.map((row) =>
        row.id === rowId ? { ...row, selectedId: matchId } : row
      );
      rowsRef.current = next;
      return next;
    });
  }, []);

  const handleSubmitList = async () => {
    if (rows.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const products = rows.map((row) => row.query);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products,
          queryText: products.join(", "),
        }),
      });

      const payload = (await response.json()) as {
        chatId?: string;
        error?: string;
      };

      if (!response.ok || !payload.chatId) {
        throw new Error(payload.error ?? "Errore durante l'invio");
      }

      try {
        sessionStorage.setItem("giuseppe:showRicercaCompletata", "1");
      } catch {
        // ignore storage errors (private mode, etc.)
      }

      router.push(`/chat/${payload.chatId}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Errore durante l'invio"
      );
      setIsSubmitting(false);
    }
  };

  const canSubmitList = rows.length > 0 && !isSubmitting;

  return (
    <div className="w-full max-w-lg text-left">
      <ProductSearchCombobox
        value={query}
        onChange={setQuery}
        onSelect={addProduct}
        onAddFromInput={() => {
          if (query.trim()) addProduct(query);
        }}
        disabled={isSubmitting}
        placeholder="Cerca un prodotto..."
      />

      <RecentSearchesStrip
        products={recentProducts}
        onSelectProduct={addProduct}
        disabled={isSubmitting}
      />

      <button
        type="button"
        onClick={() => void handleSubmitList()}
        disabled={!canSubmitList}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
      >
        {isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Confronto in corso...
          </>
        ) : (
          "Cerca e confronta prezzi"
        )}
      </button>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            La tua ricerca ({rows.length})
          </p>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={clearAllProducts}
              disabled={isSubmitting}
              className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-zinc-200"
            >
              Elimina tutto
            </button>
          ) : null}
        </div>
        {!canSubmitList && !isSubmitting ? (
          <p className="mt-5 text-xs text-center text-zinc-500">
            puoi aggiungere fino a{" "}
            <span className="font-extrabold">20 prodotti</span> per ricerca
          </p>
        ) : null}
        <ul className="mt-2 flex min-h-[8.125rem] flex-col gap-2">
          {rows.map((row) => (
            <InlineProductMatchRow
              key={row.id}
              query={row.query}
              status={row.status}
              matches={row.matches}
              selectedId={row.selectedId}
              expanded={row.expanded}
              disabled={isSubmitting}
              onToggleExpanded={() => toggleExpanded(row.id)}
              onSelectMatch={(matchId) => selectMatch(row.id, matchId)}
              onRemove={() => removeProduct(row.id)}
            />
          ))}
        </ul>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
