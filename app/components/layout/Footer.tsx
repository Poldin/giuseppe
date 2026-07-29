"use client";

import { ImproveGiuseppeDialog } from "@/app/components/feedback/ImproveGiuseppeDialog";
import { HowItWorksButton } from "@/app/components/onboarding/HowItWorksButton";
import { SITE_NAME, SITE_PAYOFF } from "@/app/lib/seo/site";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

/** Path hub SEO — letterali per evitare di trascinare lib server/Supabase nel client. */
const HUB_LINKS = [
  { href: "/pub", label: "Prodotti" },
  { href: "/vs", label: "Confronti prezzi" },
  { href: "/recall", label: "Avvisi di sicurezza" },
  { href: "/medical_device", label: "Dispositivi medici" },
  { href: "/docs/search", label: "Documenti tecnici" },
  { href: "/lista-trasparenza", label: "Lista trasparenza AIFA" },
  { href: "/notazione-dentale", label: "Notazione dentale" },
] as const;

export function Footer() {
  const [improveOpen, setImproveOpen] = useState(false);

  return (
    <>
      <footer className="mt-20 border-t border-zinc-100 dark:border-zinc-900">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 py-12">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-lg ring-2 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-100/10 sm:h-16 sm:w-16">
              <Image
                src="/giuseppe.jpeg"
                alt={SITE_NAME}
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">
                {SITE_NAME}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {SITE_PAYOFF}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex w-fit items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              Confronta prezzi e prodotti
            </Link>
            <p className="text-sm leading-relaxed text-zinc-500">
              Indica i prodotti che ti servono in studio: Giuseppe confronta le
              offerte e ti aiuta a scegliere la combinazione migliore.
            </p>
          </div>

          <nav className="flex flex-col items-start gap-2" aria-label="Azioni">
            <HowItWorksButton />
            <button
              type="button"
              onClick={() => setImproveOpen(true)}
              className="w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800"
            >
              Aiutaci a migliorare
            </button>
          </nav>

          <nav aria-label="Risorse">
            <ul className="flex flex-col gap-2">
              {HUB_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <a
            href="mailto:info@giuseppeacquisti.it"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
          >
            scrivici: info@giuseppeacquisti.it
          </a>
        </div>
      </footer>

      <ImproveGiuseppeDialog open={improveOpen} onOpenChange={setImproveOpen} />
    </>
  );
}
