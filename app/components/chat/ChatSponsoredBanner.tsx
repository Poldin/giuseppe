"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "giuseppe.chat-sponsored-banner.dismissed-date";
const SHOW_DELAY_MS = 10_000;
const CLOSE_DELAY_MS = 5_000;
const DAY_CHECK_MS = 60_000;

function getLocalDateKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function wasDismissedToday(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === getLocalDateKey();
  } catch {
    return false;
  }
}

function markDismissedToday(): void {
  try {
    localStorage.setItem(STORAGE_KEY, getLocalDateKey());
  } catch {
    // localStorage unavailable (private mode, etc.)
  }
}

type ChatSponsoredBannerProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function ChatSponsoredBanner({
  title = "Rendi il tuo Studio visibile ai pazienti",
  description = "Con MioDottore usi AI e tecnologia per diventare il riferimento agli occhi dei pazienti. Così sanno da chi andare.",
  ctaLabel = "Prenota una call",
  ctaHref = "https://calendar.app.google/AoUmwjfPVyJPuGEaA",
}: ChatSponsoredBannerProps) {
  const [visible, setVisible] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [secondsUntilClose, setSecondsUntilClose] = useState(
    Math.ceil(CLOSE_DELAY_MS / 1000)
  );

  const visibleRef = useRef(false);

  const dismiss = useCallback(() => {
    markDismissedToday();
    setVisible(false);
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;

    const clearShowTimer = () => {
      if (showTimer) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
    };

    const scheduleShowIfNeeded = () => {
      clearShowTimer();
      if (wasDismissedToday() || visibleRef.current) {
        return;
      }

      showTimer = window.setTimeout(() => {
        if (!wasDismissedToday() && !visibleRef.current) {
          setVisible(true);
        }
      }, SHOW_DELAY_MS);
    };

    const syncWithToday = () => {
      if (wasDismissedToday()) {
        clearShowTimer();
        setVisible(false);
        return;
      }

      if (!visibleRef.current) {
        scheduleShowIfNeeded();
      }
    };

    syncWithToday();

    const dayCheckInterval = window.setInterval(syncWithToday, DAY_CHECK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncWithToday();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearShowTimer();
      window.clearInterval(dayCheckInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setCanClose(false);
    setSecondsUntilClose(Math.ceil(CLOSE_DELAY_MS / 1000));

    const closeTimer = window.setTimeout(() => {
      setCanClose(true);
    }, CLOSE_DELAY_MS);

    const countdownInterval = window.setInterval(() => {
      setSecondsUntilClose((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(closeTimer);
      window.clearInterval(countdownInterval);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          role="complementary"
          aria-label="Contenuto sponsorizzato"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg shadow-zinc-900/10 sm:inset-x-6 sm:bottom-6 sm:p-5"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Sponsorizzato
              </p>
              <p className="text-lg font-black text-[#007A6B] sm:text-xl">
                {title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 sm:text-sm">
                {description}
              </p>
              {ctaHref ? (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="mt-3 inline-flex rounded-lg bg-[#007A6B] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#006559]"
                >
                  {ctaLabel}
                </a>
              ) : null}
            </div>

            <button
              type="button"
              onClick={dismiss}
              disabled={!canClose}
              aria-label={
                canClose
                  ? "Chiudi banner sponsorizzato"
                  : `Chiudi disponibile tra ${secondsUntilClose} secondi`
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {canClose ? (
                <X className="h-4 w-4" aria-hidden />
              ) : (
                <span className="text-[10px] font-bold tabular-nums text-zinc-500">
                  {secondsUntilClose}
                </span>
              )}
            </button>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
