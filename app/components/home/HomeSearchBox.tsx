"use client";

import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProductSearchCombobox } from "@/app/components/home/ProductSearchCombobox";

const SUGGESTED_PRODUCTS = [
  "guanti in nitrile",
  "guanti in lattice",
  "mascherine chirurgiche",
  "rulli di cotone",
  "aspirasaliva",
  "bicchieri monouso",
  "bavagli",
  "vassoi monouso",
  "telini",
  "garze sterili",
  "aghi per anestesia",
  "tubofustelle",
  "pellicole protettive",
  "composito dentale",
  "silicone per impronte",
  "alginato",
  "cemento dentale",
  "adesivo dentale",
  "mordenzante",
  "resina acrilica",
  "matrici sezionali",
  "perni endocanalari",
  "gesso odontoiatrico",
  "cera odontoiatrica",
  "frese diamantate",
  "frese in carburo",
  "file endodontici",
  "manipoli odontoiatrici",
  "turbine dentali",
  "contrangoli",
  "ablatori ultrasuoni",
  "specchietti dentali",
  "pinze odontoiatriche",
  "leve per estrazione",
  "siringhe aria acqua",
  "autoclave",
  "buste per sterilizzazione",
  "rotoli sterilizzazione",
  "disinfettante superfici",
  "disinfettante strumenti",
  "vasca ultrasuoni",
  "test sterilizzazione",
  "detergente ferri",
  "riunito dentale",
  "scanner intraorale",
  "radiografico endorale",
  "sensore rvg",
  "lampada fotopolimerizzatrice",
  "localizzatore d'apice",
  "motore endodontico",
  "motore implantologia",
  "telecamera intraorale",
  "bracket ortodontici",
  "fili ortodontici",
  "archi ortodontici",
  "impianti dentali",
  "monconi implantari",
  "suture chirurgiche",
  "osso sintetico",
  "membrane riassorbibili",
] as const;

function isProductSelected(selectedProducts: string[], name: string) {
  return selectedProducts.some(
    (item) => item.toLowerCase() === name.toLowerCase()
  );
}

export default function HomeSearchBox() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const maxScroll = element.scrollWidth - element.clientWidth;
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(element.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const getScrollStep = (element: HTMLDivElement) => {
    const track = element.firstElementChild;
    if (!track) return 200;

    const chips = track.querySelectorAll<HTMLElement>("[data-suggestion-chip]");
    if (chips.length >= 2) {
      return chips[1].offsetLeft - chips[0].offsetLeft;
    }
    if (chips.length === 1) {
      return chips[0].offsetWidth + 8;
    }
    return 200;
  };

  const scrollStrip = (direction: "left" | "right") => {
    const element = scrollRef.current;
    if (!element) return;

    const amount = getScrollStep(element);
    element.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

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

  const removeProduct = useCallback((name: string) => {
    setSelectedProducts((current) =>
      current.filter((item) => item.toLowerCase() !== name.toLowerCase())
    );
  }, []);

  const toggleSuggestion = (name: string) => {
    if (isProductSelected(selectedProducts, name)) {
      removeProduct(name);
    } else {
      addProduct(name);
    }
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
  const showScrollControls = canScrollLeft || canScrollRight;

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

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            potrebbero servirti
          </p>
          {showScrollControls ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollStrip("left")}
                disabled={!canScrollLeft}
                aria-label="Scorri suggerimenti a sinistra"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip("right")}
                disabled={!canScrollRight}
                aria-label="Scorri suggerimenti a destra"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        <div
          ref={scrollRef}
          className="-mx-4 min-w-0 overflow-x-auto px-4 pb-1 scrollbar-none touch-pan-x sm:-mx-1 sm:px-1"
        >
          <div className="flex w-max gap-2">
            {SUGGESTED_PRODUCTS.map((name) => {
              const selected = isProductSelected(selectedProducts, name);

              return (
                <button
                  key={name}
                  type="button"
                  data-suggestion-chip
                  onClick={() => toggleSuggestion(name)}
                  disabled={isSubmitting}
                  aria-pressed={selected}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          La tua ricerca ({selectedProducts.length})
        </p>
        {!canSubmitList && !isSubmitting ? (
          <p className="mt-5 text-xs text-center text-zinc-500">
            puoi aggiungere fino a <span className="font-extrabold">20 prodotti</span> insieme per la ricerca
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
