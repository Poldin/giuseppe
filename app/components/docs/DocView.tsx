import type { ManufacturerDocument } from "@/app/lib/docs/document";
import {
  assetTypeLabel,
  assetTypeShort,
  formatDocDateIt,
  getDocFaqItems,
  manufacturerName,
} from "@/app/lib/seo/docs";
import { ArrowUpRight, ChevronDown, FileDown } from "lucide-react";
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

export function DocView({ doc }: { doc: ManufacturerDocument }) {
  const maker = manufacturerName(doc);
  const typeLabel = assetTypeLabel(doc.asset_type);
  const typeShort = assetTypeShort(doc.asset_type);
  const faqItems = getDocFaqItems(doc);
  const sourcePage = doc.other.source_page_url?.trim() || null;
  const updated = formatDocDateIt(doc.updated_at || doc.last_seen_at);

  const meta: { label: string; value: string }[] = [
    { label: "Tipo documento", value: typeLabel },
    { label: "Fabbricante", value: maker },
  ];
  if (doc.product_name) {
    meta.push({ label: "Prodotto", value: doc.product_name });
  }
  if (doc.other.raw_asset_type && doc.other.raw_asset_type !== typeLabel) {
    meta.push({ label: "Tipo (fonte)", value: doc.other.raw_asset_type });
  }
  if (updated) {
    meta.push({ label: "Ultimo aggiornamento indice", value: updated });
  }
  if (doc.source?.domain) {
    meta.push({ label: "Dominio fonte", value: doc.source.domain });
  }

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
                href="/docs/search"
                className="font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Documenti tecnici
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">{typeShort}</li>
          </ol>
        </nav>

        {!doc.is_active ? (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          >
            Questo asset potrebbe non essere più disponibile sul sito del
            fabbricante (modifica o rimozione dal catalogo ufficiale). Verifica
            sempre sul Download Center di {maker}.
          </div>
        ) : null}

        <header className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {typeShort} · {maker} · download PDF
          </p>
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {doc.title}
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {typeLabel} di {maker}. Scarica il PDF ufficiale dal link del
            fabbricante.
          </p>
        </header>

        <section className="mt-8 flex flex-col gap-3" aria-label="Azioni">
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            <FileDown className="size-4 shrink-0" aria-hidden="true" />
            Scarica PDF
          </a>

          {sourcePage ? (
            <a
              href={sourcePage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-center text-sm font-bold text-zinc-900 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 dark:text-zinc-100 dark:ring-zinc-800 dark:hover:bg-zinc-900"
            >
              Vedi scheda sul sito del fabbricante
              <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
            </a>
          ) : null}
        </section>

        <section className="mt-10" aria-label="Dettagli documento">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
            Dettagli
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {meta.map((row) => (
              <MetaRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>

        {doc.description ? (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Descrizione
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-zinc-600 dark:text-zinc-400">
              {doc.description}
            </p>
          </section>
        ) : null}

        <p className="mt-6 text-sm leading-relaxed text-zinc-500">
          Giuseppe indicizza link pubblici a documenti tecnici dei fabbricanti
          (SDS, IFU, certificati e simili) per studi dentistici. Questa pagina
          non sostituisce il Download Center ufficiale di {maker}: controlla
          sempre versione e validità sul PDF del produttore.
        </p>

        <p className="mt-3 text-sm text-zinc-500">
          Cerca altri documenti:{" "}
          <Link
            href="/docs/search"
            className="font-semibold text-zinc-800 underline-offset-2 hover:underline dark:text-zinc-200"
          >
            /docs/search
          </Link>
        </p>

        {faqItems.length > 0 ? (
          <section
            id="faq"
            aria-labelledby="docs-faq-heading"
            className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
          >
            <h2
              id="docs-faq-heading"
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
      </main>
    </div>
  );
}
