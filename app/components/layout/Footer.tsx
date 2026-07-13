"use client";

import { ImproveGiuseppeDialog } from "@/app/components/feedback/ImproveGiuseppeDialog";
import { HowItWorksDialog } from "@/app/components/onboarding/HowItWorksDialog";
import Image from "next/image";
import { useState } from "react";

export function Footer() {
  const [improveOpen, setImproveOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  return (
    <>
      <footer className="mt-20 border-t border-zinc-100 dark:border-zinc-900">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-12">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-lg ring-2 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-100/10 sm:h-16 sm:w-16">
              <Image
                src="/giuseppe.jpeg"
                alt="Giuseppe"
                fill
                className="object-cover"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">
                Giuseppe
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                confronto prezzi e prodotti per studi dentistici
              </p>
            </div>
          </div>

          <nav className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() => setHowItWorksOpen(true)}
              className="w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800"
            >
              Come funziona?
            </button>
            <button
              type="button"
              onClick={() => setImproveOpen(true)}
              className="w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-transparent dark:bg-zinc-900 dark:font-semibold dark:text-white dark:hover:bg-zinc-800"
            >
              Aiutaci a migliorare
            </button>
          </nav>
        </div>
      </footer>

      <ImproveGiuseppeDialog open={improveOpen} onOpenChange={setImproveOpen} />
      <HowItWorksDialog
        open={howItWorksOpen}
        onOpenChange={setHowItWorksOpen}
      />
    </>
  );
}
