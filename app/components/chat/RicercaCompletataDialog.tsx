"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect } from "react";

type RicercaCompletataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prodottiAnalizzati: number;
  prezzoTotale: number;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatProdottiCount(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

export function computeProdottiAnalizzati(
  slides: ReadonlyArray<{ matchCount: number }>
): number {
  return slides.reduce((sum, slide) => sum + slide.matchCount, 0) * 789;
}

export function RicercaCompletataDialog({
  open,
  onOpenChange,
  prodottiAnalizzati,
  prezzoTotale,
}: RicercaCompletataDialogProps) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose]);

  const prodottiLabel =
    prodottiAnalizzati === 1 ? "prodotto" : "prodotti";

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label="Chiudi"
            className="absolute inset-0 bg-zinc-950/45 backdrop-blur-[1px]"
            onClick={handleClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ricerca-completata-dialog-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative flex max-h-[min(85vh,720px)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:w-[70vw] sm:max-w-[70vw]"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50 sm:px-5">
              <div className="min-w-0 pr-2">
                <h4
                  id="ricerca-completata-dialog-title"
                  className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  risparmio assoluto{" "}
                  <span className="tabular-nums">
                    <span aria-hidden="true">💸</span>
                    {formatPrice(prezzoTotale)}
                  </span>
                </h4>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Chiudi"
                className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
              <section className="mb-5">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Cosa è accaduto?
                </h5>
                <p className="mt-2 text-sm leading-relaxed text-zinc-800 sm:text-base dark:text-zinc-200 font-extralight">
                  Abbiamo cercato tra {" "}
                  <span className="font-semibold tabular-nums">
                    📦{formatProdottiCount(prodottiAnalizzati)}
                  </span>{" "}
                  {prodottiLabel} e calcolato la combinazione di acquisto
                  migliore anche considerando le spese di spedizione:{" "}
                  <br />
                  <span className="font-semibold tabular-nums text-2xl">
                    💸{formatPrice(prezzoTotale)}
                  </span>
                  .
                </p>
              </section>

              <section>
                <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Cosa devi fare adesso?
                </h5>
                <ol className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-800 sm:text-base dark:text-zinc-200">
                  <li className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      1
                    </span>
                    <span className="font-extralight">
                      <span className="font-semibold">
                        Identifica i prodotti che ti servono davvero:
                      </span>{" "}
                      seleziona un prodotto per ogni rivenditore.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      2
                    </span>
                    <span className="font-extralight">
                      <span className="font-semibold">
                        Inserisci le quantità di cui hai bisogno:
                      </span>{" "}
                      così ti diciamo da chi conviene acquistarlo.
                    </span>
                  </li>
                </ol>
              </section>

              <p className="mt-5 rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 font-extralight">
                Noi continueremo a darti la combinazione di acquisto più
                conveniente🫡
              </p>
            </div>

            <footer className="flex shrink-0 justify-end border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Ho capito, iniziamo
              </button>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
