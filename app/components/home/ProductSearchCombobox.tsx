"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type CatalogHit = {
  id: string;
  product_name: string;
  final_price: number | null;
  similarity: number;
};

type ProductSearchComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (productName: string) => void;
  onAddFromInput?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
};

export function ProductSearchCombobox({
  value,
  onChange,
  onSelect,
  onAddFromInput,
  placeholder = "Cerca o scrivi un prodotto...",
  disabled = false,
  autoFocus = false,
  className,
}: ProductSearchComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchResults, setSearchResults] = useState<CatalogHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((payload: { results?: CatalogHit[] }) => {
          setSearchResults(Array.isArray(payload.results) ? payload.results : []);
          setShowDropdown(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 280);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = value.trim();
      if (trimmed) {
        onSelect(trimmed);
      }
    }
    if (event.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const shellClassName =
    "flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 shadow-sm transition-colors focus-within:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus-within:border-zinc-700";

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ""}`}>
      <div className={shellClassName}>
        <Search
          size={18}
          className="shrink-0 text-zinc-400 dark:text-zinc-500"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (searchResults.length > 0) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        {isSearching ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-zinc-400" />
        ) : onAddFromInput ? (
          <button
            type="button"
            onClick={onAddFromInput}
            disabled={!value.trim() || disabled}
            aria-label="Aggiungi prodotto"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
          >
            <Plus size={16} />
          </button>
        ) : null}
      </div>

      {showDropdown && value.trim().length >= 2 ? (
        <ul className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          {searchResults.length === 0 && !isSearching ? (
            <li className="px-4 py-3 text-sm text-zinc-500">
              Nessun risultato — premi Invio per usare &quot;{value.trim()}&quot;
            </li>
          ) : null}
          {searchResults.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onSelect(hit.product_name)}
                className="flex w-full px-4 py-3 text-left text-sm font-medium leading-snug transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                {hit.product_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
