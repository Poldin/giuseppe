import { SITE_NAME, SITE_PAYOFF } from "@/app/lib/seo/site";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pagina non trovata",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <div className="flex flex-col gap-8">
        <div className="flex items-end gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-lg ring-2 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-100/10 sm:h-24 sm:w-24">
            <Image
              src="/giuseppe.jpeg"
              alt={SITE_NAME}
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="flex translate-y-0.5 flex-col gap-1">
            <p className="text-2xl font-black uppercase leading-none tracking-tighter sm:text-3xl">
              {SITE_NAME}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {SITE_PAYOFF}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Errore 404
          </p>
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            Pagina non trovata
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Il link potrebbe essere scaduto o il confronto non è più
            disponibile. Torna alla home e cerca i prodotti che ti servono in
            studio.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
        >
          Torna alla home
        </Link>
      </div>
    </main>
  );
}
