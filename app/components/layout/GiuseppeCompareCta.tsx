import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** CTA verso la home — stessa su /pub e footer. */
export function GiuseppeCompareCta({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex w-full items-center justify-between gap-3 rounded-2xl bg-zinc-900 px-5 py-4 text-left text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white ${className ?? ""}`}
    >
      <span className="min-w-0">
        <span className="block text-base font-black leading-snug tracking-tight sm:text-lg">
          Confronta 100k articoli su Giuseppe
        </span>
        <span className="mt-1 block text-xs font-medium text-zinc-300 dark:text-zinc-600">
          Confronta prezzi e prodotti di articoli odontoiatrici
        </span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 opacity-90" aria-hidden="true" />
    </Link>
  );
}
