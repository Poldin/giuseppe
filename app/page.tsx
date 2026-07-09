import HomeSearchBox from "@/app/components/home/HomeSearchBox";
import Image from "next/image";

const STEPS = [
  {
    title: "Scrivimi su WhatsApp",
    description:
      "Dimmi cosa ti interessa e ti apro subito la tua lista dinamica dedicata.",
  },
  {
    title: "La lista dinamica",
    description:
      "È il tuo elenco personalizzato di ciò che ti serve: serve a sapere sempre di cosa hai bisogno.",
  },
  {
    title: "Tu parli, io organizzo",
    description:
      "Mentre mi scrivi, mi mandi audio o foto, tengo in ordine la lista per te.",
  },
  {
    title: "Offerte su misura",
    description:
      "Cerco le migliori proposte dai rivenditori partner e te le mando. Ti piace? Compri. Non ti piace? Non compri.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <main className="mx-auto max-w-lg px-6 py-2">
        {/* Hero */}
        <section className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
              Ciao👋 io sono
            </p>
            <h1 className="text-4xl font-black uppercase tracking-tighter sm:text-5xl">
              Giuseppe
            </h1>
          </div>
          <div className="relative h-40 w-40 overflow-hidden rounded-full bg-zinc-100 shadow-xl ring-4 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-100/10 sm:h-48 sm:w-48">
            <Image
              src="/giuseppe.jpeg"
              alt="Giuseppe"
              fill
              className="object-cover"
              priority
            />
          </div>


          <HomeSearchBox />
        </section>

        {/* Come funziona */}
        <section className="mt-20 border-t border-zinc-100 pt-16 dark:border-zinc-900">
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

        {/* Pagamento */}
        <section className="mt-16 rounded-2xl border border-zinc-100 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
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
            <p>
              Guadagna dalle commissioni sugli acquisti, in partnership con
              dealer e rivenditori.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
