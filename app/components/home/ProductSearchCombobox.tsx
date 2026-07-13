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

function SearchResultOption({
  label,
  onSelect,
  disabled = false,
}: {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
    >
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-zinc-100 dark:text-zinc-950"
      >
        <Plus size={16} />
      </span>
    </button>
  );
}

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

  const trimmedValue = value.trim();

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (trimmedValue.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/products/search?q=${encodeURIComponent(trimmedValue)}`)
        .then((res) => res.json())
        .then((payload: { results?: CatalogHit[] }) => {
          setSearchResults(Array.isArray(payload.results) ? payload.results : []);
          setShowDropdown(true);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 280);

    return () => window.clearTimeout(timer);
  }, [trimmedValue]);

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

  const handleSelect = (productName: string) => {
    onSelect(productName);
    setShowDropdown(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (trimmedValue) {
        handleSelect(trimmedValue);
      }
    }
    if (event.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const catalogResults = searchResults.filter(
    (hit) => hit.product_name.trim().toLowerCase() !== trimmedValue.toLowerCase()
  );

  const shellClassName =
    "flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 shadow-sm transition-colors focus-within:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:focus-within:border-zinc-700";

  const plusButtonClassName =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500";

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
            if (trimmedValue.length >= 2) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center">
          {isSearching ? (
            <Loader2 size={16} className="animate-spin text-zinc-400" />
          ) : onAddFromInput ? (
            <button
              type="button"
              onClick={onAddFromInput}
              disabled={!trimmedValue || disabled}
              aria-label="Aggiungi prodotto"
              className={plusButtonClassName}
            >
              <Plus size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {showDropdown && trimmedValue.length >= 2 ? (
        <ul
          className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-lg scrollbar-thin [scrollbar-color:rgb(212_212_216)_transparent] dark:border-zinc-800 dark:bg-zinc-950 dark:[scrollbar-color:rgb(82_82_91)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-track]:bg-transparent dark:[&::-webkit-scrollbar-thumb]:bg-zinc-600"
        >
          <li>
            <SearchResultOption
              label={trimmedValue}
              disabled={disabled}
              onSelect={() => handleSelect(trimmedValue)}
            />
          </li>

          {isSearching && catalogResults.length === 0 ? (
            <li className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
              Ricerca in corso...
            </li>
          ) : null}

          {catalogResults.map((hit) => (
            <li key={hit.id}>
              <SearchResultOption
                label={hit.product_name}
                disabled={disabled}
                onSelect={() => handleSelect(hit.product_name)}
              />
            </li>
          ))}

          {!isSearching && catalogResults.length === 0 ? (
            <li className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
              Nessun altro risultato nel catalogo
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
