"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  IntroTabConfrontaDemo,
  IntroTabLeggiDemo,
  IntroTabSelezionaDemo,
  IntroTabTotaleDemo,
  type IntroDemoData,
} from "@/app/components/chat/AnalisiIntroTabDemos";

export type { IntroDemoData };

export type AnalisiReferenzaSlide = {
  queryIndex: number;
  queryText: string;
  matchCount: number;
};

type AnalisiUnoPerUnoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slides: AnalisiReferenzaSlide[];
  renderSlideContent: (queryIndex: number) => React.ReactNode;
  introDemo: IntroDemoData;
  prezzoTotale: number;
  showPendingOptimization?: boolean;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function SlideNavigation({
  slideIndex,
  referenzeCount,
  isLastSlide,
  isIntroSlide,
  onPrevious,
  onNext,
  onFinish,
}: {
  slideIndex: number;
  referenzeCount: number;
  isLastSlide: boolean;
  isIntroSlide: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onPrevious}
        disabled={slideIndex === 0}
        aria-label="Slide precedente"
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-2.5 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Indietro</span>
      </button>

      <span
        aria-live="polite"
        className="min-w-12 px-1 text-center text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300"
      >
        {slideIndex}/{referenzeCount}
      </span>

      {isLastSlide ? (
        <button
          type="button"
          onClick={onFinish}
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 sm:px-2.5 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Fatto
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          aria-label={isIntroSlide ? "Inizia l'analisi" : "Referenza successiva"}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 sm:px-2.5 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <span className="hidden sm:inline">
            {isIntroSlide ? "Inizia" : "Avanti"}
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

const INTRO_STEPS = [
  {
    emoji: "🔎",
    tabLabel: "Leggi",
    title: "Leggi la referenza",
    description:
      "Ogni slide corrisponde a un prodotto che hai chiesto. Parti dal nome e capisci cosa stai cercando.",
  },
  {
    emoji: "🛒",
    tabLabel: "Confronta",
    title: "Confronta le offerte",
    description:
      "Scorri le proposte dei rivenditori partner e valuta prezzo, brand e disponibilità.",
  },
  {
    emoji: "✓",
    tabLabel: "Seleziona",
    title: "Seleziona e indica la quantità",
    description:
      "Scegli l'offerta migliore per quella referenza e indica quante unità ti servono.",
  },
  {
    emoji: "💸",
    tabLabel: "Totale",
    title: "Controlla il totale",
    description:
      "In alto a destra vedi il prezzo complessivo del tuo ordine, aggiornato e ottimizzato in tempo reale.",
  },
] as const;

function IntroSlidePanel({
  introDemo,
  active,
  prezzoTotale,
  showPendingOptimization = false,
  onStart,
}: {
  introDemo: IntroDemoData;
  active: boolean;
  prezzoTotale: number;
  showPendingOptimization?: boolean;
  onStart: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [autoRotateEpoch, setAutoRotateEpoch] = useState(0);
  const step = INTRO_STEPS[activeTab];

  const selectTab = useCallback((index: number) => {
    setActiveTab(index);
    setAutoRotateEpoch((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!active) {
      setActiveTab(0);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveTab((current) => (current + 1) % INTRO_STEPS.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [active, autoRotateEpoch]);

  const renderTabDemo = () => {
    switch (activeTab) {
      case 0:
        return <IntroTabLeggiDemo demo={introDemo} />;
      case 1:
        return <IntroTabConfrontaDemo demo={introDemo} />;
      case 2:
        return (
          <IntroTabSelezionaDemo
            demo={introDemo}
            active={active && activeTab === 2}
          />
        );
      case 3:
        return (
          <IntroTabTotaleDemo
            prezzoTotale={prezzoTotale}
            showPendingOptimization={showPendingOptimization}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-w-0">
      <h3 className="text-xl font-bold leading-snug text-zinc-900 sm:text-2xl dark:text-zinc-100">
        Una referenza alla volta, senza perderti nulla
      </h3>

      <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none sm:mt-6">
        {INTRO_STEPS.map((item, index) => {
          const selected = index === activeTab;

          return (
            <button
              key={item.title}
              type="button"
              onClick={() => selectTab(index)}
              aria-selected={selected}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              <span aria-hidden="true">{item.emoji}</span>
              {item.tabLabel}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onStart}
          className="ml-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-md transition-[transform,background-color] hover:bg-zinc-800 active:scale-[0.98] sm:ml-1 sm:text-sm dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Inizia
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="mt-4 min-h-48"
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {step.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {step.description}
          </p>
          <div className="mt-4">{renderTabDemo()}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function PrezzoTotaleBadge({
  prezzoTotale,
  showPendingOptimization = false,
}: {
  prezzoTotale: number;
  showPendingOptimization?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white/95 px-3 py-1.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95 sm:gap-2 sm:px-4 sm:py-2"
      aria-label={`Prezzo totale: ${formatPrice(prezzoTotale)}`}
    >
      <span className="text-xl leading-none sm:text-2xl" aria-hidden="true">
        💸
      </span>
      {showPendingOptimization ? (
        <span className="text-base leading-none sm:text-lg" aria-hidden="true">
          ⚡
        </span>
      ) : null}
      <span className="text-sm font-bold tabular-nums tracking-tight sm:text-base">
        {formatPrice(prezzoTotale)}
      </span>
    </div>
  );
}

export function AnalisiUnoPerUnoDialog({
  open,
  onOpenChange,
  slides,
  renderSlideContent,
  introDemo,
  prezzoTotale,
  showPendingOptimization = false,
}: AnalisiUnoPerUnoDialogProps) {
  const [slideIndex, setSlideIndex] = useState(0);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const goToPrevious = useCallback(() => {
    setSlideIndex((current) => Math.max(0, current - 1));
  }, []);

  const totalSlides = slides.length + 1;
  const isIntroSlide = slideIndex === 0;
  const currentReferenza = isIntroSlide ? null : slides[slideIndex - 1];
  const totalProdottiAnalizzati = useMemo(
    () => slides.reduce((sum, slide) => sum + slide.matchCount, 0),
    [slides]
  );
  const prodottiAnalizzatiDisplay = totalProdottiAnalizzati * 789;

  const goToNext = useCallback(() => {
    setSlideIndex((current) => Math.min(totalSlides - 1, current + 1));
  }, [totalSlides]);

  const slideNavProps = {
    slideIndex,
    referenzeCount: slides.length,
    isLastSlide: slideIndex === totalSlides - 1,
    isIntroSlide,
    onPrevious: goToPrevious,
    onNext: goToNext,
    onFinish: handleClose,
  };

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => setSlideIndex(0), 220);
      return () => window.clearTimeout(timer);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
        return;
      }

      if (event.key === "ArrowLeft") {
        setSlideIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (event.key === "ArrowRight") {
        setSlideIndex((current) => Math.min(totalSlides - 1, current + 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleClose, totalSlides]);

  useEffect(() => {
    if (slideIndex >= totalSlides && totalSlides > 0) {
      setSlideIndex(totalSlides - 1);
    }
  }, [slideIndex, totalSlides]);

  return (
    <AnimatePresence>
      {open && slides.length > 0 ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="flex h-full min-h-0 flex-col"
          >
            <div className="relative shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
              <div className="relative flex items-center gap-2 sm:gap-3">
                <h2
                  id="analisi-uno-per-uno-title"
                  className="relative z-10 min-w-0 shrink text-lg font-black uppercase tracking-tighter sm:text-xl"
                >
                  Analisi 1 per 1 🧐
                </h2>

                <div className="absolute left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1.5 md:flex">
                  <SlideNavigation {...slideNavProps} />
                </div>

                <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 md:hidden">
                    <SlideNavigation {...slideNavProps} />
                  </div>

                  <div className="hidden items-center gap-2 md:flex">
                    <PrezzoTotaleBadge
                      prezzoTotale={prezzoTotale}
                      showPendingOptimization={showPendingOptimization}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Chiudi"
                    className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-5xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5">
                {!isIntroSlide && currentReferenza ? (
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-zinc-900 sm:text-base dark:text-zinc-100">
                      <span aria-hidden="true" className="mr-1.5">
                        🔎
                      </span>
                      {currentReferenza.queryText}
                    </p>
                    <p className="shrink-0 pt-0.5 text-right text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {slideIndex}/{slides.length} · totale:{" "}
                      {currentReferenza.matchCount}
                    </p>
                  </div>
                ) : (
                  <div className="mb-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm font-light leading-snug text-zinc-600 sm:text-base dark:text-zinc-400">
                        Come funziona?
                      </p>
                      <p className="shrink-0 pt-0.5 text-right text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        0/{slides.length}
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-800 sm:text-base dark:text-zinc-200">
                      Abbiamo già analizzato{" "}
                      <span className="font-semibold tabular-nums">
                        📦
                        {new Intl.NumberFormat("it-IT").format(
                          prodottiAnalizzatiDisplay
                        )}
                      </span>{" "}
                      {prodottiAnalizzatiDisplay === 1 ? "prodotto" : "prodotti"}{" "}
                      e ottimizzato per te il carrello su prodotti e costi di
                      spedizione. Miglior prezzo:{" "}
                      <span className="font-semibold tabular-nums">
                        💸{formatPrice(prezzoTotale)}
                      </span>
                      . Segui le istruzioni e raffina la ricerca.
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Vuoi andare subito ai risultati? Chiudi questa finestra
                      con la{" "}
                      <span className="inline-flex align-middle" aria-hidden="true">
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </span>{" "}
                      in alto a destra.
                    </p>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={isIntroSlide ? "intro" : currentReferenza?.queryIndex}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -24 }}
                    transition={{ duration: 0.22 }}
                  >
                    {isIntroSlide ? (
                      <IntroSlidePanel
                        introDemo={introDemo}
                        active={open && isIntroSlide}
                        prezzoTotale={prezzoTotale}
                        showPendingOptimization={showPendingOptimization}
                        onStart={goToNext}
                      />
                    ) : currentReferenza ? (
                      <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-zinc-100 p-4 dark:border-zinc-900 dark:bg-zinc-900/50 sm:p-5">
                        {renderSlideContent(currentReferenza.queryIndex)}
                      </article>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
