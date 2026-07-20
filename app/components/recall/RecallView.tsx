import {
  recallDisplayName,
  type RecallRecord,
} from "@/app/lib/recall/recall";
import {
  formatRecallDateIt,
  getRecallFaqItems,
} from "@/app/lib/seo/recall";
import { ArrowUpRight, ChevronDown, FileText } from "lucide-react";
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

export function RecallView({ recall }: { recall: RecallRecord }) {
  const name = recallDisplayName(recall);
  const ministryUrl = recall.link_pagina?.trim() || null;
  const pdfUrl = recall.link_pdf_allegato?.trim() || null;
  const description = recall.other.descrizione_dispositivo?.trim() || null;
  const faqItems = getRecallFaqItems(recall);

  const meta: { label: string; value: string }[] = [];
  meta.push({ label: "Numero riferimento", value: recall.numero_riferimento });
  if (recall.fabbricante) {
    meta.push({ label: "Fabbricante", value: recall.fabbricante });
  }
  if (recall.tipo_dispositivo) {
    meta.push({ label: "Tipo dispositivo", value: recall.tipo_dispositivo });
  }
  const dataRicezione = formatRecallDateIt(recall.data_ricezione);
  if (dataRicezione) {
    meta.push({ label: "Data di ricezione", value: dataRicezione });
  }
  const dataPubblicazione = formatRecallDateIt(recall.data_pubblicazione);
  if (dataPubblicazione && dataPubblicazione !== dataRicezione) {
    meta.push({ label: "Data di pubblicazione", value: dataPubblicazione });
  }
  const dataAggiornamento = formatRecallDateIt(
    recall.other.data_ultimo_aggiornamento
  );
  if (dataAggiornamento) {
    meta.push({
      label: "Ultimo aggiornamento",
      value: dataAggiornamento,
    });
  }
  if (recall.other.azione) {
    meta.push({ label: "Azione", value: recall.other.azione });
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
            <li className="text-zinc-500">Avvisi di sicurezza</li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">{name}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {name}
          </h1>
          {(recall.fabbricante || recall.tipo_dispositivo) && (
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {[recall.fabbricante, recall.tipo_dispositivo]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </header>

        <section className="mt-10" aria-label="Dettagli avviso">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
            Dettagli
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {meta.map((row) => (
              <MetaRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>

        {description ? (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
              Descrizione
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </section>
        ) : null}

        <section className="mt-10 flex flex-col gap-3" aria-label="Azioni">
          {ministryUrl ? (
            <a
              href={ministryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              Vedi sul sito del Ministero della Salute
              <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
            </a>
          ) : null}

          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-center text-sm font-bold text-zinc-900 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 dark:text-zinc-100 dark:ring-zinc-800 dark:hover:bg-zinc-900"
            >
              <FileText className="size-4 shrink-0" aria-hidden="true" />
              Apri avviso PDF (FSN)
              {recall.other.pdf_filename ? (
                <span className="sr-only">: {recall.other.pdf_filename}</span>
              ) : null}
            </a>
          ) : null}
        </section>

        <p className="mt-6 text-sm leading-relaxed text-zinc-500">
          Giuseppe indicizza avvisi pubblici del Ministero della Salute. Questa
          pagina non è la fonte ufficiale: verifica sempre i dettagli e i
          documenti sul portale del Ministero.
        </p>

        {faqItems.length > 0 ? (
          <section
            id="faq"
            aria-labelledby="recall-faq-heading"
            className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
          >
            <h2
              id="recall-faq-heading"
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
