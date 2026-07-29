"use client";

import { ArrowUpRight } from "lucide-react";

export function PubProductActions({
  productUrl,
  ecommerceName,
}: {
  productUrl: string | null;
  ecommerceName: string | null;
}) {
  if (!productUrl) return null;

  return (
    <div className="mt-10 flex flex-col gap-3">
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-3.5 text-center text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Vedi su {ecommerceName?.trim() || "rivenditore"}
        <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </a>
    </div>
  );
}
