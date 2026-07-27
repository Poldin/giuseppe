import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function AifaMetaRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
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

export function AifaBreadcrumb({
  items,
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ) : (
              <span className="truncate text-zinc-500">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AifaShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export function AifaFaq({
  id,
  items,
}: {
  id: string;
  items: { question: string; answer: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section
      id="faq"
      aria-labelledby={`${id}-faq-heading`}
      className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
    >
      <h2
        id={`${id}-faq-heading`}
        className="mb-4 text-lg font-black uppercase tracking-tighter"
      >
        Domande frequenti
      </h2>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((item) => (
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
  );
}

export function AifaDisclaimer() {
  return (
    <p className="mt-8 text-sm leading-relaxed text-zinc-500">
      Giuseppe ripubblica i dati pubblici della{" "}
      <a
        href="https://www.aifa.gov.it/liste-di-trasparenza"
        className="underline underline-offset-2 hover:text-zinc-700"
        rel="noopener noreferrer"
        target="_blank"
      >
        Lista di trasparenza AIFA
      </a>
      . Questa pagina non sostituisce la fonte ufficiale: verifica sempre sul
      sito AIFA prima di decisioni su prezzi e rimborso.
    </p>
  );
}
