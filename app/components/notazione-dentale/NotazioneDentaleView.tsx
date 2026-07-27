import { ToothSelector } from "@/app/components/notazione-dentale/ToothSelector";
import {
  getSiblingTeeth,
  palmerNotation,
  type ToothRecord,
} from "@/app/lib/notazione-dentale/teeth";
import {
  getToothFaqItems,
  getToothIntro,
  notazioneDentaleHubPath,
  notazioneDentalePath,
} from "@/app/lib/seo/notazione-dentale";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-44">
        {label}
      </dt>
      <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </dd>
    </div>
  );
}

export function NotazioneDentaleView({ tooth }: { tooth: ToothRecord }) {
  const faqItems = getToothFaqItems(tooth);
  const siblings = getSiblingTeeth(tooth);
  const intro = getToothIntro(tooth);

  const meta: { label: string; value: string }[] = [
    { label: "Nome anatomico", value: tooth.nome_anatomico },
    { label: "FDI (ISO 3950)", value: tooth.fdi },
    { label: "Universal (ADA)", value: tooth.universal },
    {
      label: "Palmer",
      value: `${palmerNotation(tooth)} (simbolo ${tooth.palmer_simbolo}, n. ${tooth.palmer_numero})`,
    },
    {
      label: "Quadrante",
      value: `${tooth.quadrante_id} — ${tooth.quadrante_nome}`,
    },
    {
      label: "Dente del giudizio",
      value: tooth.is_dente_giudizio ? "Sì" : "No",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
            <li>
              <Link
                href="/"
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Giuseppe
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={notazioneDentaleHubPath()}
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Notazione dentale
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">FDI {tooth.fdi}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {tooth.nome_anatomico}
          </h1>
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            FDI {tooth.fdi} · Universal {tooth.universal} · Palmer{" "}
            {palmerNotation(tooth)}
          </p>
        </header>

        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {intro}
        </p>

        <section className="mt-10" aria-label="Notazioni">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
            Notazioni
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {meta.map((row) => (
              <MetaRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>

        {siblings.length > 0 ? (
          <section className="mt-10" aria-label="Stesso quadrante">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Altri denti — {tooth.quadrante_nome}
            </h2>
            <ul className="flex flex-col gap-2">
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={notazioneDentalePath(s.slug)}
                    className="text-sm font-medium text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-200"
                  >
                    FDI {s.fdi} — {s.nome_anatomico}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {faqItems.length > 0 ? (
          <section
            id="faq"
            aria-labelledby="notazione-faq-heading"
            className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
          >
            <h2
              id="notazione-faq-heading"
              className="mb-4 text-lg font-black uppercase tracking-tighter"
            >
              Domande frequenti
            </h2>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {faqItems.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="cursor-pointer list-none py-3.5 text-sm font-bold leading-snug transition-colors hover:text-zinc-600 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                    <span className="flex items-start justify-between gap-3">
                      {item.question}
                      <ChevronDown
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
                      />
                    </span>
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <section
          aria-labelledby="tooth-selector-heading"
          className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
        >
          <h2
            id="tooth-selector-heading"
            className="mb-4 text-lg font-black uppercase tracking-tighter"
          >
            Esplora un altro dente
          </h2>
          <ToothSelector currentSlug={tooth.slug} />
        </section>
      </main>
    </div>
  );
}
