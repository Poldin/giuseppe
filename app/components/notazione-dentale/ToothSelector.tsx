"use client";

import {
  getAllTeeth,
  getToothBySlug,
  palmerNotation,
  type ToothRecord,
} from "@/app/lib/notazione-dentale/teeth";
import { notazioneDentalePath } from "@/app/lib/seo/notazione-dentale";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ToothSelectorProps = {
  /** Slug della pagina corrente; omesso sull’hub. */
  currentSlug?: string;
  selectId?: string;
};

function ToothPreview({ tooth }: { tooth: ToothRecord }) {
  return (
    <dl className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-900">
      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
          Nome
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {tooth.nome_anatomico}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
          FDI
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {tooth.fdi}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
          Universal
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {tooth.universal}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
          Palmer
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {palmerNotation(tooth)}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
        <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
          Quadrante
        </dt>
        <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {tooth.quadrante_id} — {tooth.quadrante_nome}
        </dd>
      </div>
      {tooth.is_dente_giudizio ? (
        <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
          <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-zinc-500 sm:w-36">
            Nota
          </dt>
          <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Dente del giudizio (terzo molare)
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ToothSelector({
  currentSlug,
  selectId = "tooth-select",
}: ToothSelectorProps) {
  const router = useRouter();
  const teeth = getAllTeeth();
  const initialSlug = currentSlug ?? teeth[0]?.slug ?? "";
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const selected = getToothBySlug(selectedSlug) ?? teeth[0];

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={selectId}
        className="text-sm font-bold uppercase tracking-wide text-zinc-500"
      >
        Seleziona un dente
      </label>
      <select
        id={selectId}
        value={selectedSlug}
        onChange={(e) => {
          const slug = e.target.value;
          setSelectedSlug(slug);
          if (slug !== currentSlug) {
            router.push(notazioneDentalePath(slug));
          }
        }}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none ring-zinc-900 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
      >
        {teeth.map((tooth) => (
          <option key={tooth.slug} value={tooth.slug}>
            FDI {tooth.fdi} — {tooth.nome_anatomico} (U{tooth.universal} ·{" "}
            {palmerNotation(tooth)})
          </option>
        ))}
      </select>
      {selected ? <ToothPreview tooth={selected} /> : null}
    </div>
  );
}
