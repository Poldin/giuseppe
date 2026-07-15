import HomeSearchBox from "@/app/components/home/HomeSearchBox";
import { HomeEcommerceBadges } from "@/app/components/home/HomeEcommerceBadges";
import { HowItWorksButton } from "@/app/components/onboarding/HowItWorksButton";
import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";
import Image from "next/image";

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
  const ecommerces = await fetchEcommerceCatalog();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <main className="mx-auto max-w-lg px-2 py-2">
        {/* Hero */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <HowItWorksButton className="shrink-0 self-end sm:order-2" />
            <div className="flex items-center gap-4 sm:order-1">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-xl ring-4 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-100/10 sm:h-24 sm:w-24">
                <Image
                  src="/giuseppe.jpeg"
                  alt="Giuseppe"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
                  Ciao👋 io sono
                </p>
                <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-5xl">
                  Giuseppe
                </h1>
              </div>
            </div>
          </div>

          <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-lg">
            confronto prezzi e prodotti <span className="font-extrabold">su +100K articoli</span> disponibili
          </p>
          <div className="mt-10">
            <HomeSearchBox />
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
