import {
  AifaBreadcrumb,
  AifaDisclaimer,
  AifaFaq,
  AifaMetaRow,
  AifaShell,
} from "@/app/components/aifa/AifaChrome";
import { AifaPriceHistoryChart } from "@/app/components/aifa/AifaPriceHistoryChart";
import type {
  AifaGroup,
  AifaMedicine,
  AifaPriceHistoryPoint,
  AifaRelease,
} from "@/app/lib/aifa/types";
import {
  atcPath,
  dittaPath,
  equivalentiPath,
  farmacoPath,
  formatAifaDateIt,
  formatEuroIt,
  getEquivalentiFaq,
  listaTrasparenzaPath,
  principioAttivoPath,
} from "@/app/lib/seo/aifa";
import Link from "next/link";

export function EquivalentiView({
  group,
  medicines,
  release,
}: {
  group: AifaGroup;
  medicines: AifaMedicine[];
  release: AifaRelease | null;
}) {
  const ingredient = group.ingredient?.name ?? "Principio attivo";
  const dateLabel = formatAifaDateIt(release?.published_on);
  const faq = getEquivalentiFaq(group, medicines, release);
  const rif =
    medicines.find((m) => m.prezzo_riferimento_ssn != null)
      ?.prezzo_riferimento_ssn ?? null;

  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { href: listaTrasparenzaPath(), label: "Lista trasparenza AIFA" },
          { label: group.code },
        ]}
      />

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          Equivalenti {ingredient}
        </h1>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Gruppo {group.code}
          {group.reference_pack_label ? ` · ${group.reference_pack_label}` : ""}
        </p>
        {dateLabel ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Prezzi AIFA aggiornati al {dateLabel}
            {rif != null ? ` · riferimento SSN ${formatEuroIt(rif)}` : ""}
          </p>
        ) : null}
      </header>

      <section className="mt-8" aria-label="Dettagli gruppo">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-zinc-500">
          Dettagli
        </h2>
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
          <AifaMetaRow label="Codice gruppo" value={group.code} />
          {group.ingredient ? (
            <AifaMetaRow
              label="Principio attivo"
              value={
                <Link
                  href={principioAttivoPath(group.ingredient.slug)}
                  className="underline underline-offset-2"
                >
                  {group.ingredient.name}
                </Link>
              }
            />
          ) : null}
          {group.reference_pack_label ? (
            <AifaMetaRow
              label="Confezione di riferimento"
              value={group.reference_pack_label}
            />
          ) : null}
          {group.atc ? (
            <AifaMetaRow
              label="ATC"
              value={
                <Link
                  href={atcPath(group.atc.slug)}
                  className="underline underline-offset-2"
                >
                  {group.atc.code}
                </Link>
              }
            />
          ) : null}
          {rif != null ? (
            <AifaMetaRow
              label="Prezzo riferimento SSN"
              value={formatEuroIt(rif)}
            />
          ) : null}
        </dl>
      </section>

      <section className="mt-10" aria-label="Confronto prezzi">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
          Confronto prezzi ({medicines.length})
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {medicines.map((m) => {
            const diff = m.differenza ?? 0;
            return (
              <li key={m.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={farmacoPath(m.slug)}
                      className="text-sm font-bold uppercase tracking-tight hover:underline"
                    >
                      {m.name}
                    </Link>
                    {m.company ? (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        <Link
                          href={dittaPath(m.company.slug)}
                          className="hover:underline"
                        >
                          {m.company.name}
                        </Link>
                      </p>
                    ) : null}
                    {m.pack_description ? (
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        {m.pack_description}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums">
                      {formatEuroIt(m.prezzo_pubblico)}
                    </p>
                    {diff > 0 ? (
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                        +{formatEuroIt(diff)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        al rif.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {medicines.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nessun farmaco attivo in questo gruppo nell’ultimo aggiornamento.
          </p>
        ) : null}
      </section>

      <AifaDisclaimer />
      <AifaFaq id="equivalenti" items={faq} />
    </AifaShell>
  );
}

export function PrincipioAttivoView({
  ingredient,
  groups,
  release,
}: {
  ingredient: { name: string; slug: string };
  groups: AifaGroup[];
  release: AifaRelease | null;
}) {
  const dateLabel = formatAifaDateIt(release?.published_on);
  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { href: listaTrasparenzaPath(), label: "Lista trasparenza AIFA" },
          { label: ingredient.name },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          {ingredient.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Gruppi di equivalenza e prezzi dalla Lista di trasparenza AIFA
          {dateLabel ? ` (aggiornamento ${dateLabel})` : ""}.
        </p>
      </header>
      <section className="mt-10" aria-label="Gruppi di equivalenza">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
          Gruppi ({groups.length})
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {groups.map((g) => (
            <li key={g.id} className="py-4">
              <Link
                href={equivalentiPath(g.slug)}
                className="text-sm font-bold uppercase tracking-tight hover:underline"
              >
                Gruppo {g.code}
              </Link>
              {g.reference_pack_label ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {g.reference_pack_label}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <AifaDisclaimer />
    </AifaShell>
  );
}

export function FarmacoView({
  medicine,
  release,
  history,
}: {
  medicine: AifaMedicine;
  release: AifaRelease | null;
  history: AifaPriceHistoryPoint[];
}) {
  const dateLabel = formatAifaDateIt(release?.published_on);
  const diff = medicine.differenza ?? 0;
  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { href: listaTrasparenzaPath(), label: "Lista trasparenza AIFA" },
          ...(medicine.group
            ? [
                {
                  href: equivalentiPath(medicine.group.slug),
                  label: medicine.group.code,
                },
              ]
            : []),
          { label: medicine.name },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          {medicine.name}
        </h1>
        <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          AIC {medicine.aic}
          {medicine.company ? ` · ${medicine.company.name}` : ""}
        </p>
        {dateLabel ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Prezzi AIFA al {dateLabel}
          </p>
        ) : null}
      </header>

      <AifaPriceHistoryChart
        history={history}
        currentPubblico={medicine.prezzo_pubblico}
        currentRiferimento={medicine.prezzo_riferimento_ssn}
        currentPublishedOn={release?.published_on ?? null}
      />

      <section className="mt-8" aria-label="Prezzi">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
          <AifaMetaRow
            label="Prezzo pubblico"
            value={formatEuroIt(medicine.prezzo_pubblico)}
          />
          <AifaMetaRow
            label="Prezzo riferimento SSN"
            value={formatEuroIt(medicine.prezzo_riferimento_ssn)}
          />
          <AifaMetaRow
            label="Differenza"
            value={
              diff > 0 ? (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {formatEuroIt(diff)} a carico del cittadino
                </span>
              ) : (
                "Nessuna (al prezzo di riferimento)"
              )
            }
          />
          {medicine.pack_description ? (
            <AifaMetaRow label="Confezione" value={medicine.pack_description} />
          ) : null}
          {medicine.ingredient ? (
            <AifaMetaRow
              label="Principio attivo"
              value={
                <Link
                  href={principioAttivoPath(medicine.ingredient.slug)}
                  className="underline underline-offset-2"
                >
                  {medicine.ingredient.name}
                </Link>
              }
            />
          ) : null}
          {medicine.group ? (
            <AifaMetaRow
              label="Gruppo equivalenza"
              value={
                <Link
                  href={equivalentiPath(medicine.group.slug)}
                  className="underline underline-offset-2"
                >
                  {medicine.group.code}
                </Link>
              }
            />
          ) : null}
          {medicine.company ? (
            <AifaMetaRow
              label="Ditta"
              value={
                <Link
                  href={dittaPath(medicine.company.slug)}
                  className="underline underline-offset-2"
                >
                  {medicine.company.name}
                </Link>
              }
            />
          ) : null}
          {medicine.atc ? (
            <AifaMetaRow
              label="ATC"
              value={
                <Link
                  href={atcPath(medicine.atc.slug)}
                  className="underline underline-offset-2"
                >
                  {medicine.atc.code}
                </Link>
              }
            />
          ) : null}
          {medicine.nota ? (
            <AifaMetaRow label="Nota AIFA" value={medicine.nota} />
          ) : null}
        </dl>
      </section>

      {medicine.group ? (
        <p className="mt-8">
          <Link
            href={equivalentiPath(medicine.group.slug)}
            className="text-sm font-bold uppercase tracking-wide underline underline-offset-2"
          >
            Confronta tutti gli equivalenti del gruppo {medicine.group.code} →
          </Link>
        </p>
      ) : null}

      {history.length > 0 ? (
        <section className="mt-12" aria-label="Storico prezzi">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
            Storico prezzi ({history.length})
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-zinc-500">
            Solo le date in cui è cambiato almeno un prezzo (o nota/gruppo) nella
            Lista di trasparenza AIFA.
          </p>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {history.map((point) => {
              const d = formatAifaDateIt(point.published_on);
              const pointDiff = point.differenza ?? 0;
              return (
                <li
                  key={point.published_on}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{d ?? point.published_on}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      rif. SSN {formatEuroIt(point.prezzo_riferimento_ssn)}
                      {point.equivalence_group_code
                        ? ` · gruppo ${point.equivalence_group_code}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums">
                      {formatEuroIt(point.prezzo_pubblico)}
                    </p>
                    {pointDiff > 0 ? (
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                        +{formatEuroIt(pointDiff)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <AifaDisclaimer />
    </AifaShell>
  );
}

export function ListaTrasparenzaView({
  release,
  groups,
  stats,
}: {
  release: AifaRelease | null;
  groups: AifaGroup[];
  stats: {
    medicines: number;
    groups: number;
    ingredients: number;
  };
}) {
  const dateLabel = formatAifaDateIt(release?.published_on);
  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { label: "Lista trasparenza AIFA" },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          Lista di trasparenza AIFA
        </h1>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Confronta prezzi pubblici e prezzo di riferimento SSN dei farmaci
          equivalenti pubblicati da AIFA
          {dateLabel ? `, aggiornamento ${dateLabel}` : ""}.
        </p>
      </header>

      <section className="mt-8" aria-label="Copertura dati">
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-900">
          <AifaMetaRow
            label="Farmaci attivi"
            value={stats.medicines.toLocaleString("it-IT")}
          />
          <AifaMetaRow
            label="Gruppi equivalenza"
            value={stats.groups.toLocaleString("it-IT")}
          />
          <AifaMetaRow
            label="Principi attivi"
            value={stats.ingredients.toLocaleString("it-IT")}
          />
        </dl>
      </section>

      <section className="mt-10" aria-label="Esempi gruppi">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">
          Esempi di gruppi
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {groups.map((g) => (
            <li key={g.id} className="py-4">
              <Link
                href={equivalentiPath(g.slug)}
                className="text-sm font-bold uppercase tracking-tight hover:underline"
              >
                {g.ingredient?.name ?? "Gruppo"} · {g.code}
              </Link>
              {g.reference_pack_label ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {g.reference_pack_label}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          Prova ad esempio:{" "}
          <Link
            href={equivalentiPath("h1a")}
            className="font-semibold underline underline-offset-2"
          >
            Acarbosio gruppo H1A
          </Link>
          {" · "}
          <Link
            href={principioAttivoPath("acarbosio")}
            className="font-semibold underline underline-offset-2"
          >
            principio Acarbosio
          </Link>
          {" · "}
          <Link
            href={farmacoPath("glucobay-26851016")}
            className="font-semibold underline underline-offset-2"
          >
            Glucobay
          </Link>
        </p>
      </section>
      <AifaDisclaimer />
    </AifaShell>
  );
}

export function AtcView({
  atc,
  groups,
}: {
  atc: { code: string; slug: string };
  groups: AifaGroup[];
}) {
  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { href: listaTrasparenzaPath(), label: "Lista trasparenza AIFA" },
          { label: `ATC ${atc.code}` },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          ATC {atc.code}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Gruppi di equivalenza AIFA classificati con questo codice ATC.
        </p>
      </header>
      <ul className="mt-10 divide-y divide-zinc-100 dark:divide-zinc-900">
        {groups.map((g) => (
          <li key={g.id} className="py-4">
            <Link
              href={equivalentiPath(g.slug)}
              className="text-sm font-bold uppercase tracking-tight hover:underline"
            >
              {g.ingredient?.name ?? "Gruppo"} · {g.code}
            </Link>
            {g.reference_pack_label ? (
              <p className="mt-1 text-xs text-zinc-500">
                {g.reference_pack_label}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <AifaDisclaimer />
    </AifaShell>
  );
}

export function DittaView({
  company,
  medicines,
}: {
  company: { name: string; slug: string };
  medicines: AifaMedicine[];
}) {
  return (
    <AifaShell>
      <AifaBreadcrumb
        items={[
          { href: "/", label: "Giuseppe" },
          { href: listaTrasparenzaPath(), label: "Lista trasparenza AIFA" },
          { label: company.name },
        ]}
      />
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-black uppercase leading-tight tracking-tighter sm:text-3xl">
          {company.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Farmaci della ditta presenti nella Lista di trasparenza AIFA.
        </p>
      </header>
      <ul className="mt-10 divide-y divide-zinc-100 dark:divide-zinc-900">
        {medicines.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 py-4">
            <div className="min-w-0">
              <Link
                href={farmacoPath(m.slug)}
                className="text-sm font-bold uppercase tracking-tight hover:underline"
              >
                {m.name}
              </Link>
              {m.group ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Gruppo {m.group.code}
                </p>
              ) : null}
            </div>
            <p className="shrink-0 text-sm font-black tabular-nums">
              {formatEuroIt(m.prezzo_pubblico)}
            </p>
          </li>
        ))}
      </ul>
      {medicines.length >= 200 ? (
        <p className="mt-4 text-xs text-zinc-500">
          Mostrate le prime 200 confezioni attive.
        </p>
      ) : null}
      <AifaDisclaimer />
    </AifaShell>
  );
}
