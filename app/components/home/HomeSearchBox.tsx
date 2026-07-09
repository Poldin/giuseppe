"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";

export default function HomeSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/products/suggestions")
      .then((res) => res.json())
      .then((payload: { suggestions?: string[] }) => {
        if (Array.isArray(payload.suggestions)) {
          setSuggestions(payload.suggestions);
        }
      })
      .catch(() => {
        /* suggerimenti opzionali */
      });
  }, []);

  const addProduct = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSelectedProducts((current) => {
      const exists = current.some(
        (item) => item.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) return current;
      return [...current, trimmed];
    });
    setQuery("");
    setError(null);
  }, []);

  const removeProduct = (index: number) => {
    setSelectedProducts((current) => current.filter((_, i) => i !== index));
  };

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
        placeholder="Cerca un prodotto..."
      />

      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Suggerimenti
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addProduct(name)}
                disabled={isSubmitting}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedProducts.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            La tua lista ({selectedProducts.length})
          </p>
          <ul className="flex flex-col gap-2">
            {selectedProducts.map((product, index) => (
              <li
                key={`${product}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <span className="font-medium">{product}</span>
                <button
                  type="button"
                  onClick={() => removeProduct(index)}
                  disabled={isSubmitting}
                  aria-label={`Rimuovi ${product}`}
                  className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => void handleSubmitList()}
            disabled={!canSubmitList}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Confronto in corso...
              </>
            ) : (
              "Confronta prezzi"
            )}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-zinc-500">
          Cerca, seleziona un suggerimento o premi Invio per aggiungere testo libero
        </p>
      )}

      {error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
