"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

export function QuantityControl({
  quantity,
  onQuantityChange,
  compact = false,
}: {
  quantity: number;
  onQuantityChange: (next: number) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  const commitDraft = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    onQuantityChange(next);
    setDraft(String(next));
  };

  const buttonClassName = compact
    ? "p-1 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
    : "rounded-l-lg p-2.5 text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 sm:p-1 dark:text-zinc-300 dark:hover:bg-zinc-800";

  const plusButtonClassName = compact
    ? buttonClassName
    : "rounded-r-lg p-2.5 text-zinc-600 transition-colors hover:bg-zinc-100 sm:p-2 dark:text-zinc-300 dark:hover:bg-zinc-800";

  const inputClassName = compact
    ? "w-8 border-0 bg-transparent py-1 text-center text-xs font-semibold tabular-nums text-zinc-900 outline-none dark:text-zinc-100"
    : "w-10 border-0 bg-transparent py-2 text-center text-sm font-semibold tabular-nums text-zinc-900 outline-none dark:text-zinc-100";

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          const next = Math.max(1, quantity - 1);
          onQuantityChange(next);
          setDraft(String(next));
        }}
        disabled={quantity <= 1}
        className={compact ? `${buttonClassName} rounded-l-lg` : buttonClassName}
        aria-label="Diminuisci quantità"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "");
          setDraft(next);
          if (next.length > 0) {
            commitDraft(next);
          }
        }}
        onBlur={() => commitDraft(draft)}
        aria-label="Quantità"
        className={inputClassName}
      />
      <button
        type="button"
        onClick={() => {
          const next = quantity + 1;
          onQuantityChange(next);
          setDraft(String(next));
        }}
        className={compact ? `${plusButtonClassName} rounded-r-lg` : plusButtonClassName}
        aria-label="Aumenta quantità"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
