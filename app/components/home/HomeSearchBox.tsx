"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";
import { RecentSearchesStrip } from "@/app/components/home/RecentSearchesStrip";
import type { RecentPublicSearch } from "@/app/lib/search/chat-store";

const MAX_PRODUCTS = 20;

export default function HomeSearchBox({
  recentSearches = [],
}: {
  recentSearches?: RecentPublicSearch[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addProduct = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSelectedProducts((current) => {
      const exists = current.some(
        (item) => item.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists || current.length >= MAX_PRODUCTS) return current;
      return [...current, trimmed];
    });
    setQuery("");
    setError(null);
  }, []);

  const addProductsFromSearch = useCallback((products: string[]) => {
    setSelectedProducts((current) => {
      const next = [...current];

      for (const name of products) {
        const trimmed = name.trim();
        if (!trimmed) continue;

        const exists = next.some(
          (item) => item.toLowerCase() === trimmed.toLowerCase()
        );
        if (exists || next.length >= MAX_PRODUCTS) continue;

        next.push(trimmed);
      }

      return next;
    });
    setQuery("");
    setError(null);
  }, []);

  const removeProduct = useCallback((name: string) => {
    setSelectedProducts((current) =>
      current.filter((item) => item.toLowerCase() !== name.toLowerCase())
    );
  }, []);

  const clearAllProducts = useCallback(() => {
    setSelectedProducts([]);
    setError(null);
  }, []);

  const handleSubmitList = async () => {
    if (selectedProducts.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: selectedProducts,
          queryText: selectedProducts.join(", "),
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

  const canSubmitList = selectedProducts.length > 0 && !isSubmitting;

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
        placeholder="Cerca un prodotto alla volta..."
      />

      <RecentSearchesStrip
        searches={recentSearches}
        onSelectSearch={addProductsFromSearch}
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
            La tua ricerca ({selectedProducts.length})
          </p>
          {selectedProducts.length > 0 ? (
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
            puoi aggiungere fino a <span className="font-extrabold">20 prodotti</span> per ricerca
          </p>
        ) : null}
        <ul className="mt-2 flex min-h-[8.125rem] flex-col gap-2">
          {selectedProducts.map((product, index) => (
            <li
              key={`${product}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50"
            >
              <span className="font-medium">{product}</span>
              <button
                type="button"
                onClick={() => removeProduct(product)}
                disabled={isSubmitting}
                aria-label={`Rimuovi ${product}`}
                className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
