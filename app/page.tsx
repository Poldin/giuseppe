import HomeSearchBox from "@/app/components/home/HomeSearchBox";
import { HomeEcommerceBadges } from "@/app/components/home/HomeEcommerceBadges";
import { HowItWorksButton } from "@/app/components/onboarding/HowItWorksButton";
import { fetchRecentPublicSearches } from "@/app/lib/search/chat-store";
import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";
import Image from "next/image";

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

/** Giorno di calendario in Europe/Rome. */
function getRomeYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

/**
 * Stats "ieri": data di ieri (Rome) + conteggio 1000–3000 stabile per giornata,
 * seedato sul timestamp 00:00 UTC di quel giorno di calendario.
 */
function getYesterdaySearchStats(now = new Date()) {
  const today = getRomeYmd(now);
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth() + 1;
  const day = yesterday.getUTCDate();
  const midnightUtc = Date.UTC(year, month - 1, day);

  // LCG deterministico → stesso seed = stesso numero
  let state = midnightUtc >>> 0;
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  const count = 1000 + (state % 2001); // 1000..3000 inclusi

  return {
    day,
    monthName: MONTHS_IT[month - 1],
    count,
  };
}

/** Aggiorna almeno ogni ora così “ieri” e il conteggio ruotano dopo mezzanotte. */
export const revalidate = 3600;

const STEPS = [
  {
    title: "Cosa ti serve?",
    description:
      "indica la lista dei prodotti che ti servono in Studio.",
  },
  {
    title: "Lasciami comparare prezzi e prodotti",
    description:
      "Faccio una ricerca sui principali rivenditori e ti mostro le migliori offerte.",
  },
  {
    title: "Modifica e migliora la ricerca",
    description:
      "Seleziona i prodotti migliori per ogni tua esigenza e componi il tuo ordine migliore.",
  },
  {
    title: "Acquista in tutta sicurezza dai rivenditori.",
    description:
      "Io ti aiuto a a trovare la migliore combinazione di prodotti e prezzi: acquista in tutta sicurezza dai rivenditori.",
  },
];

export default async function Home() {
  const [ecommerces, recentSearches] = await Promise.all([
    fetchEcommerceCatalog(),
    fetchRecentPublicSearches(),
  ]);
  const yesterdayStats = getYesterdaySearchStats();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <main className="mx-auto max-w-lg px-2 py-2">
        {/* Hero */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <HowItWorksButton className="shrink-0 self-end" />
            <div className="flex items-end gap-4">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900 sm:h-24 sm:w-24">
                <Image
                  src="/giuseppe.jpeg"
                  alt="Giuseppe"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              <div className="flex translate-y-0.5 flex-col gap-1">
                <p className="text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
                  Ciao👋 io sono
                </p>
                <h1 className="text-4xl font-black uppercase leading-none tracking-tighter sm:text-5xl">
                  Giuseppe
                </h1>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-base leading-relaxed text-zinc-900 sm:text-lg">
              <span className="box-decoration-clone bg-white px-1 py-0.5 dark:bg-white dark:text-zinc-900">
                confronto prezzi e prodotti{" "}
                <span className="font-extrabold">su +100K articoli</span>{" "}
                disponibili
              </span>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              ieri, {yesterdayStats.day} {yesterdayStats.monthName} sono state
              eseguite {yesterdayStats.count.toLocaleString("it-IT")} ricerche
            </p>
          </div>
          <div className="mt-10">
            <HomeSearchBox recentSearches={recentSearches} />
          </div>
        </section>

        {/* Come funziona */}
        <section
          id="come-funziona"
          className="mt-20 scroll-mt-6 border-t border-zinc-100 pt-16 dark:border-zinc-900"
        >
          <h2 className="mb-10 text-3xl font-black uppercase tracking-tighter sm:text-4xl">
            Come funziona
          </h2>

          <ol className="flex flex-col gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1 pt-0.5">
                  <h3 className="font-bold leading-snug">{step.title}</h3>
                  <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <HomeEcommerceBadges ecommerces={ecommerces} />

        {/* Pagamento */}
        <section className="mt-16">
          <h2 className="mb-4 text-2xl font-black uppercase tracking-tighter sm:text-3xl">
            Quanto costa?
          </h2>
          <div className="flex flex-col gap-3 leading-relaxed text-zinc-600 dark:text-zinc-400">
            <p>
              Giuseppe è un servizio{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                gratuito
              </span>{" "}
              per gli studi dentistici.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
