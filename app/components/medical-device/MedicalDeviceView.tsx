import {
  medicalDeviceDisplayName,
  type MedicalDeviceRecord,
} from "@/app/lib/medical-device/device";
import {
  formatMedicalDeviceDateIt,
  getMedicalDeviceFaqItems,
} from "@/app/lib/seo/medical-device";
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

function repertorioLabel(value: string | null): string | null {
  if (value === "S") return "Sì";
  if (value === "N") return "No";
  return value;
}

export function MedicalDeviceView({ device }: { device: MedicalDeviceRecord }) {
  const name = medicalDeviceDisplayName(device);
  const faqItems = getMedicalDeviceFaqItems(device);

  const meta: { label: string; value: string }[] = [];
  meta.push({ label: "Progressivo Repertorio", value: device.progressivo_dm_ass });
  if (device.fabbricante_assemblatore) {
    meta.push({ label: "Fabbricante", value: device.fabbricante_assemblatore });
  }
  if (device.cod_catalogo_fabbr_ass) {
    meta.push({
      label: "Codice catalogo",
      value: device.cod_catalogo_fabbr_ass,
    });
  }
  if (device.classificazione_cnd) {
    meta.push({ label: "Classificazione CND", value: device.classificazione_cnd });
  }
  if (device.descrizione_cnd) {
    meta.push({ label: "Descrizione CND", value: device.descrizione_cnd });
  }
  const iscritto = repertorioLabel(device.iscrizione_repertorio);
  if (iscritto) {
    meta.push({ label: "Iscrizione Repertorio", value: iscritto });
  }
  if (device.partita_iva_vat) {
    meta.push({ label: "P. IVA / VAT", value: device.partita_iva_vat });
  } else if (device.cod_fiscale) {
    meta.push({ label: "Codice fiscale", value: device.cod_fiscale });
  }
  if (device.dm_riferimento) {
    meta.push({ label: "DM di riferimento", value: device.dm_riferimento });
  }
  if (device.gruppo_dm_simili) {
    meta.push({ label: "Gruppo DM simili", value: device.gruppo_dm_simili });
  }

  const dataPrima = formatMedicalDeviceDateIt(device.data_prima_pubblicazione);
  if (dataPrima) {
    meta.push({ label: "Prima pubblicazione", value: dataPrima });
  }
  const dataInizio = formatMedicalDeviceDateIt(device.data_inizio_validita);
  if (dataInizio) {
    meta.push({ label: "Inizio validità", value: dataInizio });
  }
  const dataFineValidita = formatMedicalDeviceDateIt(device.data_fine_validita);
  if (dataFineValidita) {
    meta.push({ label: "Fine validità", value: dataFineValidita });
  }
  const dataFineCommercio = formatMedicalDeviceDateIt(device.data_fine_commercio);
  if (dataFineCommercio) {
    meta.push({ label: "Fine commercializzazione", value: dataFineCommercio });
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
            <li className="text-zinc-500">Dispositivi medici</li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-zinc-500">{name}</li>
          </ol>
        </nav>

        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
            {name}
          </h1>
          {(device.fabbricante_assemblatore || device.classificazione_cnd) && (
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {[device.fabbricante_assemblatore, device.classificazione_cnd]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </header>

        <section className="mt-10" aria-label="Dettagli dispositivo">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
            Dettagli
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {meta.map((row) => (
              <MetaRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        </section>

        <p className="mt-8 text-sm leading-relaxed text-zinc-500">
          Giuseppe indicizza dati pubblici del Ministero della Salute (banca dati
          e Repertorio dei dispositivi medici). Questa pagina non è la fonte
          ufficiale: verifica sempre lo stato aggiornato sul portale del
          Ministero.
        </p>

        {faqItems.length > 0 ? (
          <section
            id="faq"
            aria-labelledby="medical-device-faq-heading"
            className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900"
          >
            <h2
              id="medical-device-faq-heading"
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
