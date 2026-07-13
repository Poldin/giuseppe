"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ImproveGiuseppeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ImproveGiuseppeDialog({
  open,
  onOpenChange,
}: ImproveGiuseppeDialogProps) {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
      if (event.key === "Escape" && !isSubmitting) {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isSubmitting, handleClose]);

  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => {
        setMessage("");
        setError(null);
        setSubmitted(false);
        setIsSubmitting(false);
      }, 220);

      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          other: {
            pathname:
              typeof window !== "undefined" ? window.location.pathname : null,
            source: "improve_giuseppe_dialog",
          },
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Errore durante l'invio");
      }

      setSubmitted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Errore durante l'invio"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = message.trim().length >= 3 && !isSubmitting;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="flex h-full min-h-0 flex-col"
          >
            <div className="relative flex h-full min-h-0 flex-col">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                aria-label="Chiudi"
                className="absolute right-4 top-4 z-10 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 sm:right-6 sm:top-6"
              >
                <X className="h-5 w-5" />
              </button>

            <div className="mx-auto flex w-full max-w-lg min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
              {submitted ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                  <CheckCircle2 className="h-12 w-12 text-zinc-900 dark:text-zinc-100" />
                  <div className="flex max-w-sm flex-col gap-2">
                    <h2 className="text-2xl font-black uppercase tracking-tighter sm:text-3xl">
                      Grazie
                    </h2>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
                      Grazie per il tempo che ci hai dedicato. Il tuo feedback ci
                      aiuta a migliorare Giuseppe.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-4 rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    Chiudi
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6 shrink-0">
                    <h2 className="text-3xl font-black uppercase tracking-tighter sm:text-4xl">
                      Aiutaci a migliorare
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
                      Raccontaci come stai usando Giuseppe, cosa ti è utile e cosa
                      potremmo fare meglio. Ogni suggerimento conta.
                    </p>
                  </div>

                  <label className="flex min-h-0 flex-1 flex-col gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Il tuo messaggio
                    </span>
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Es. mi piace confrontare i prezzi, ma vorrei poter salvare le mie liste..."
                      className="min-h-[12rem] flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-700 dark:focus:bg-zinc-900 sm:min-h-[14rem] sm:text-base"
                    />
                  </label>

                  {error ? (
                    <p className="mt-3 shrink-0 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  ) : null}

                  <div className="mt-5 shrink-0 pb-[max(0px,env(safe-area-inset-bottom))]">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={!canSubmit}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-3.5 text-sm font-semibold text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-500"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Invio in corso...
                        </>
                      ) : (
                        "Invia feedback"
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
