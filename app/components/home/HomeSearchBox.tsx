"use client";

import { Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HomeCartPanel,
  type HomeCartLine,
} from "@/app/components/home/HomeCartPanel";
import {
  InlineProductMatchRow,
  type InlineProductRowStatus,
} from "@/app/components/home/InlineProductMatchRow";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";
import { RecentSearchesStrip } from "@/app/components/home/RecentSearchesStrip";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";
import type {
  HomesearchCartLineRef,
  HomesearchQueryRow,
  HomesearchSessionSnapshot,
} from "@/app/lib/search/homesearch-store";
import type { EcommerceInfo } from "@/app/lib/search/elabora-scenari-types";
import { buildShippingTiersMap } from "@/app/lib/search/shipping-cost";

const MAX_PRODUCTS = 20;
/** One inline-match at a time; queued rows still show the loading UI. */
const MAX_CONCURRENT_MATCHES = 1;
const SRC_PARAM = "src";

type ProductRow = {
  id: string;
  dbQueryId: string | null;
  query: string;
  status: InlineProductRowStatus;
  matches: InlineMatchCandidate[];
  selectedId: string | null;
  quantities: Record<string, number>;
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

function formatEuroTotal(value: number): string {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function selectedRowLineTotal(row: ProductRow): number | null {
  if (row.status !== "ready" || row.matches.length === 0) return null;
  const selected =
    row.matches.find((match) => match.id === row.selectedId) ?? row.matches[0];
  if (!selected) return null;
  const quantity = Math.max(1, row.quantities[selected.id] ?? 1);
  return selected.prezzo * quantity;
}

function cartLineFromMatch(
  rowId: string,
  query: string,
  match: InlineMatchCandidate,
  quantity = 1
): HomeCartLine {
  const qty = Math.max(1, quantity);
  return {
    id: `${rowId}:${match.id}`,
    rowId,
    matchId: match.id,
    query,
    productName: match.product_name,
    brand: match.brand,
    ecommerceId: match.ecommerce_id,
    ecommerceName: match.ecommerce_name,
    logoUrl: match.logo_url,
    quantity: qty,
    unitPrice: match.prezzo,
    lineTotal: match.prezzo * qty,
  };
}

/** Snapshot iniziale carrello da session — poi resta indipendente dalla selezione centrale. */
function buildInitialCartLines(rows: ProductRow[]): HomeCartLine[] {
  const lines: HomeCartLine[] = [];
  for (const row of rows) {
    if (row.status !== "ready" || row.matches.length === 0) continue;
    const selected =
      row.matches.find((match) => match.id === row.selectedId) ?? row.matches[0];
    if (!selected) continue;
    const quantity = Math.max(1, row.quantities[selected.id] ?? 1);
    lines.push(cartLineFromMatch(row.id, row.query, selected, quantity));
  }
  return lines;
}

/** Restore cart from session.other.cart; legacy sessions without cart fall back to selected matches. */
function resolveCartLines(
  rows: ProductRow[],
  cartRefs: HomesearchCartLineRef[] | undefined
): HomeCartLine[] {
  if (cartRefs === undefined) {
    return buildInitialCartLines(rows);
  }

  const lines: HomeCartLine[] = [];
  for (const ref of cartRefs) {
    const row = rows.find((item) => item.id === ref.rowId);
    if (!row || row.status !== "ready") continue;
    const match = row.matches.find((item) => item.id === ref.matchId);
    if (!match) continue;
    lines.push(
      cartLineFromMatch(row.id, row.query, match, ref.quantity)
    );
  }
  return lines;
}

function cartLinesToRefs(lines: HomeCartLine[]): HomesearchCartLineRef[] {
  return lines.map((line) => ({
    rowId: line.rowId,
    matchId: line.matchId,
    quantity: line.quantity,
  }));
}

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

function queryRowToProductRow(row: HomesearchQueryRow): ProductRow {
  return {
    id: row.other.client_row_id ?? row.id,
    dbQueryId: row.id,
    query: row.query,
    status: row.other.status,
    matches: row.results,
    selectedId: row.other.selectedId,
    quantities: buildQuantities(row.results, row.other.quantities),
    expanded: false,
  };
}

function setSrcInUrl(sessionId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (sessionId) {
    url.searchParams.set(SRC_PARAM, sessionId);
  } else {
    url.searchParams.delete(SRC_PARAM);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

async function persistQueryUpdate(
  dbQueryId: string,
  patch: {
    results?: InlineMatchCandidate[];
    selectedId?: string | null;
    quantities?: Record<string, number>;
    status?: InlineProductRowStatus;
  }
) {
  try {
    await fetch(`/api/homesearch/query/${dbQueryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch (error) {
    console.error("homesearch query update failed:", error);
  }
}

export default function HomeSearchBox({
  recentProducts = [],
  initialSession = null,
  ecommerces = [],
}: {
  recentProducts?: string[];
  initialSession?: HomesearchSessionSnapshot | null;
  ecommerces?: EcommerceInfo[];
}) {
  const tiersByEcommerce = buildShippingTiersMap(ecommerces);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProductRow[]>(() =>
    initialSession ? initialSession.queries.map(queryRowToProductRow) : []
  );
  const [cartLines, setCartLines] = useState<HomeCartLine[]>(() => {
    if (!initialSession) return [];
    const productRows = initialSession.queries.map(queryRowToProductRow);
    return resolveCartLines(productRows, initialSession.other.cart);
  });
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const rowsRef = useRef<ProductRow[]>(rows);
  const cartLinesRef = useRef<HomeCartLine[]>(cartLines);
  const sessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  const sessionCreatePromiseRef = useRef<Promise<string> | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const matchQueueRef = useRef<QueuedMatch[]>([]);
  const activeMatchCountRef = useRef(0);
  const runMatchRef = useRef<(rowId: string, productName: string) => Promise<void>>(
    async () => undefined
  );
  const persistTimersRef = useRef<Map<string, number>>(new Map());
  const cartPersistTimerRef = useRef<number | null>(null);
  /** Skip hydrate write only when cart was already stored on the session. */
  const skipNextCartPersistRef = useRef(
    Boolean(initialSession && initialSession.other.cart !== undefined)
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    cartLinesRef.current = cartLines;
  }, [cartLines]);

  useEffect(() => {
    if (initialSession?.id) {
      setSrcInUrl(initialSession.id);
    }
  }, [initialSession?.id]);

  const persistCartNow = useCallback(async (lines: HomeCartLine[]) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      await fetch(`/api/homesearch/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: cartLinesToRefs(lines) }),
      });
    } catch (persistError) {
      console.error("homesearch cart persist failed:", persistError);
    }
  }, []);

  const schedulePersistCart = useCallback(() => {
    if (skipNextCartPersistRef.current) {
      skipNextCartPersistRef.current = false;
      return;
    }
    if (!sessionIdRef.current) return;

    if (cartPersistTimerRef.current != null) {
      window.clearTimeout(cartPersistTimerRef.current);
    }
    cartPersistTimerRef.current = window.setTimeout(() => {
      cartPersistTimerRef.current = null;
      void persistCartNow(cartLinesRef.current);
    }, 300);
  }, [persistCartNow]);

  useEffect(() => {
    schedulePersistCart();
  }, [cartLines, schedulePersistCart]);

  useEffect(() => {
    return () => {
      for (const controller of abortControllersRef.current.values()) {
        controller.abort();
      }
      abortControllersRef.current.clear();
      matchQueueRef.current = [];
      activeMatchCountRef.current = 0;
      for (const timer of persistTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      persistTimersRef.current.clear();
      if (cartPersistTimerRef.current != null) {
        window.clearTimeout(cartPersistTimerRef.current);
      }
    };
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;

    const fromUrl =
      typeof window !== "undefined"
        ? new URL(window.location.href).searchParams.get(SRC_PARAM)
        : null;
    if (fromUrl) {
      sessionIdRef.current = fromUrl;
      return fromUrl;
    }

    if (sessionCreatePromiseRef.current) return sessionCreatePromiseRef.current;

    sessionCreatePromiseRef.current = (async () => {
      const response = await fetch("/api/homesearch/session", { method: "POST" });
      const payload = (await response.json()) as {
        sessionId?: string;
        error?: string;
      };
      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error ?? "Impossibile creare la sessione");
      }
      sessionIdRef.current = payload.sessionId;
      setSrcInUrl(payload.sessionId);
      // Cart may have been filled before the session existed — flush now.
      if (cartLinesRef.current.length > 0) {
        void persistCartNow(cartLinesRef.current);
      }
      return payload.sessionId;
    })();

    try {
      return await sessionCreatePromiseRef.current;
    } finally {
      sessionCreatePromiseRef.current = null;
    }
  }, [persistCartNow]);

  const persistRowNow = useCallback((row: ProductRow) => {
    if (!row.dbQueryId) return;
    void persistQueryUpdate(row.dbQueryId, {
      results: row.matches,
      selectedId: row.selectedId,
      quantities: row.quantities,
      status: row.status,
    });
  }, []);

  const schedulePersistRow = useCallback(
    (rowId: string) => {
      const existing = persistTimersRef.current.get(rowId);
      if (existing) window.clearTimeout(existing);

      const timer = window.setTimeout(() => {
        persistTimersRef.current.delete(rowId);
        const row = rowsRef.current.find((item) => item.id === rowId);
        if (row) persistRowNow(row);
      }, 300);

      persistTimersRef.current.set(rowId, timer);
    },
    [persistRowNow]
  );

  const createDbQuery = useCallback(
    async (rowId: string, productName: string) => {
      try {
        const sessionId = await ensureSession();
        const response = await fetch("/api/homesearch/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            query: productName,
            clientRowId: rowId,
          }),
        });
        const payload = (await response.json()) as {
          queryId?: string;
          error?: string;
        };
        if (!response.ok || !payload.queryId) {
          throw new Error(payload.error ?? "Impossibile salvare la query");
        }

        const queryId = payload.queryId;
        setRows((current) => {
          const next = current.map((row) =>
            row.id === rowId ? { ...row, dbQueryId: queryId } : row
          );
          rowsRef.current = next;
          return next;
        });

        // Match may have finished before the DB row existed — flush current state.
        const rowToFlush = rowsRef.current.find((row) => row.id === rowId);
        if (rowToFlush?.dbQueryId && rowToFlush.status !== "loading") {
          persistRowNow(rowToFlush);
        }
      } catch (persistError) {
        console.error("homesearch query create failed:", persistError);
      }
    },
    [ensureSession, persistRowNow]
  );

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

  const runInlineMatch = useCallback(
    async (rowId: string, productName: string) => {
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
          selectedId?: string | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Errore durante il confronto");
        }

        const matches = Array.isArray(payload.matches) ? payload.matches : [];
        const selectedId =
          typeof payload.selectedId === "string"
            ? payload.selectedId
            : matches[0]?.id ?? null;

        let updatedRow: ProductRow | null = null;
        setRows((current) => {
          const next = current.map((row) => {
            if (row.id !== rowId) return row;
            updatedRow = {
              ...row,
              status: matches.length > 0 ? "ready" : "empty",
              matches,
              selectedId,
              quantities: buildQuantities(matches, row.quantities),
              // A fine confronto apri subito la riga se ci sono risultati
              expanded: matches.length > 0,
            };
            return updatedRow;
          });
          rowsRef.current = next;
          return next;
        });

        if (updatedRow) persistRowNow(updatedRow);

        // Nuovo confronto: inserisci in carrello il match scelto dal sistema
        if (matches.length > 0) {
          const selected =
            matches.find((match) => match.id === selectedId) ?? matches[0];
          if (selected) {
            setCartLines((current) => {
              if (
                current.some(
                  (line) => line.rowId === rowId && line.matchId === selected.id
                )
              ) {
                return current;
              }
              return [
                cartLineFromMatch(rowId, productName, selected, 1),
                ...current,
              ];
            });
          }
        }
      } catch (fetchError) {
        if (controller.signal.aborted) return;

        let updatedRow: ProductRow | null = null;
        setRows((current) => {
          const next = current.map((row) => {
            if (row.id !== rowId) return row;
            updatedRow = {
              ...row,
              status: "error",
              matches: [],
              selectedId: null,
              quantities: {},
            };
            return updatedRow;
          });
          rowsRef.current = next;
          return next;
        });
        if (updatedRow) persistRowNow(updatedRow);
        console.error("Inline match failed:", fetchError);
      } finally {
        if (abortControllersRef.current.get(rowId) === controller) {
          abortControllersRef.current.delete(rowId);
        }
      }
    },
    [persistRowNow]
  );

  useEffect(() => {
    runMatchRef.current = runInlineMatch;
  }, [runInlineMatch]);

  // Re-run match for hydrated rows interrupted mid-loading.
  useEffect(() => {
    if (!initialSession) return;
    for (const row of initialSession.queries) {
      if (row.other.status === "loading") {
        const productRow = queryRowToProductRow(row);
        enqueueInlineMatch(productRow.id, productRow.query);
      }
    }
    // Intentionally once on mount for the initial snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return;
      }

      const rowId = createRowId();
      const nextRow: ProductRow = {
        id: rowId,
        dbQueryId: null,
        query: trimmed,
        status: "loading",
        matches: [],
        selectedId: null,
        quantities: {},
        expanded: false,
      };

      // Keep ref in sync immediately so rapid successive adds see each other.
      rowsRef.current = [nextRow, ...current];
      setRows(rowsRef.current);
      void createDbQuery(rowId, trimmed);
      enqueueInlineMatch(rowId, trimmed);

      setQuery("");
    },
    [createDbQuery, enqueueInlineMatch]
  );

  const removeProduct = useCallback(
    (rowId: string) => {
      const controller = abortControllersRef.current.get(rowId);
      controller?.abort();
      abortControllersRef.current.delete(rowId);
      matchQueueRef.current = matchQueueRef.current.filter((item) => item.rowId !== rowId);

      const timer = persistTimersRef.current.get(rowId);
      if (timer) {
        window.clearTimeout(timer);
        persistTimersRef.current.delete(rowId);
      }

      const removed = rowsRef.current.find((row) => row.id === rowId);
      rowsRef.current = rowsRef.current.filter((row) => row.id !== rowId);
      setRows(rowsRef.current);
      setCartLines((current) => current.filter((line) => line.rowId !== rowId));
      pumpMatchQueue();

      if (removed?.dbQueryId) {
        void fetch(`/api/homesearch/query/${removed.dbQueryId}`, {
          method: "DELETE",
        }).catch((err) => console.error("homesearch query delete failed:", err));
      }
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
    for (const timer of persistTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    persistTimersRef.current.clear();

    const sessionId = sessionIdRef.current;
    rowsRef.current = [];
    setRows([]);
    setCartLines([]);
    sessionIdRef.current = null;
    sessionCreatePromiseRef.current = null;
    setSrcInUrl(null);

    if (sessionId) {
      void fetch(`/api/homesearch/session/${sessionId}`, {
        method: "DELETE",
      }).catch((err) => console.error("homesearch session clear failed:", err));
    }
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

  const changeCartQuantity = useCallback((lineId: string, nextQty: number) => {
    const quantity = Math.max(1, Math.floor(nextQty) || 1);
    setCartLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              quantity,
              lineTotal: line.unitPrice * quantity,
            }
          : line
      )
    );
  }, []);

  const removeFromCart = useCallback((lineId: string) => {
    setCartLines((current) => current.filter((line) => line.id !== lineId));
  }, []);

  const addToCart = useCallback((rowId: string, matchId: string) => {
    const row = rowsRef.current.find((item) => item.id === rowId);
    if (!row) return;
    const match = row.matches.find((item) => item.id === matchId);
    if (!match) return;

    setCartLines((current) => {
      if (
        current.some(
          (line) => line.rowId === rowId && line.matchId === matchId
        )
      ) {
        return current;
      }
      const quantity = Math.max(1, row.quantities[matchId] ?? 1);
      return [cartLineFromMatch(rowId, row.query, match, quantity), ...current];
    });
  }, []);

  const selectMatch = useCallback(
    (rowId: string, matchId: string) => {
      setRows((current) => {
        const next = current.map((row) =>
          row.id === rowId ? { ...row, selectedId: matchId } : row
        );
        rowsRef.current = next;
        return next;
      });
      schedulePersistRow(rowId);
    },
    [schedulePersistRow]
  );

  const changeQuantity = useCallback(
    (rowId: string, matchId: string, nextQty: number) => {
      const quantity = Math.max(1, Math.floor(nextQty) || 1);
      setRows((current) => {
        const next = current.map((row) =>
          row.id === rowId
            ? {
                ...row,
                quantities: { ...row.quantities, [matchId]: quantity },
              }
            : row
        );
        rowsRef.current = next;
        return next;
      });
      schedulePersistRow(rowId);
    },
    [schedulePersistRow]
  );

  const retryMatch = useCallback(
    (rowId: string) => {
      const row = rowsRef.current.find((item) => item.id === rowId);
      if (!row) return;

      setRows((current) => {
        const next = current.map((item) =>
          item.id === rowId
            ? {
                ...item,
                status: "loading" as const,
                matches: [],
                selectedId: null,
                quantities: {},
                expanded: false,
              }
            : item
        );
        rowsRef.current = next;
        return next;
      });
      enqueueInlineMatch(rowId, row.query);
    },
    [enqueueInlineMatch]
  );

  const handleShare = useCallback(async () => {
    setShareFeedback(null);

    try {
      const sessionId = await ensureSession();
      setSrcInUrl(sessionId);

      const url = new URL(window.location.href);
      url.searchParams.set(SRC_PARAM, sessionId);
      const shareUrl = url.toString();
      const shareText = "Guarda la ricerca prodotti che ho preparato con Giuseppe";
      const shareData: ShareData = {
        title: "Giuseppe - Ricerca prodotti",
        text: shareText,
        url: shareUrl,
      };

      if (typeof navigator.share === "function") {
        try {
          await navigator.share(shareData);
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") {
            return;
          }
        }
      }

      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setShareFeedback("Link copiato");
      window.setTimeout(() => setShareFeedback(null), 2000);
    } catch (shareError) {
      console.error("homesearch share failed:", shareError);
      setShareFeedback("Condivisione non disponibile");
      window.setTimeout(() => setShareFeedback(null), 2500);
    }
  }, [ensureSession]);

  const totalEuro = rows.reduce((sum, row) => {
    const line = selectedRowLineTotal(row);
    return line != null ? sum + line : sum;
  }, 0);
  const hasPricedRows = rows.some((row) => selectedRowLineTotal(row) != null);

  return (
    <div className="w-full max-w-lg text-left">
      <HomeCartPanel
        lines={cartLines}
        tiersByEcommerce={tiersByEcommerce}
        onQuantityChange={changeCartQuantity}
        onRemove={removeFromCart}
      />

      <ProductSearchCombobox
        value={query}
        onChange={setQuery}
        onSelect={addProduct}
        onAddFromInput={() => {
          if (query.trim()) addProduct(query);
        }}
        placeholder="Cerca un prodotto..."
      />

      <RecentSearchesStrip
        products={recentProducts}
        onSelectProduct={addProduct}
      />

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {rows.length} {rows.length === 1 ? "prodotto" : "prodotti"}
            {hasPricedRows ? (
              <>
                {" · "}
                <span className="tabular-nums">{formatEuroTotal(totalEuro)}</span>
              </>
            ) : null}
          </p>
          {rows.length > 0 ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleShare()}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <Share2 size={12} aria-hidden />
                {shareFeedback ?? "Condividi"}
              </button>
              <button
                type="button"
                onClick={clearAllProducts}
                className="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Elimina tutto
              </button>
            </div>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="mt-5 text-xs text-center text-zinc-500">
            puoi aggiungere fino a{" "}
            <span className="font-extrabold">20 prodotti</span> per ricerca
          </p>
        ) : null}
        <ul className="mt-2 flex min-h-[8.125rem] flex-col gap-2">
          {rows.map((row) => {
            const cartMatchIds = cartLines
              .filter((line) => line.rowId === row.id)
              .map((line) => line.matchId);
            return (
            <InlineProductMatchRow
              key={row.id}
              query={row.query}
              status={row.status}
              matches={row.matches}
              selectedId={row.selectedId}
              quantities={row.quantities}
              expanded={row.expanded}
              cartMatchIds={cartMatchIds}
              onToggleExpanded={() => toggleExpanded(row.id)}
              onSelectMatch={(matchId) => selectMatch(row.id, matchId)}
              onAddToCart={(matchId) => addToCart(row.id, matchId)}
              onQuantityChange={(matchId, next) =>
                changeQuantity(row.id, matchId, next)
              }
              onRemove={() => removeProduct(row.id)}
              onRetry={() => retryMatch(row.id)}
            />
            );
          })}
        </ul>
      </div>
    </div>
  );
}
