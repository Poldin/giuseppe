import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;

/** Same window size as pub sitemap chunks (Google 50k URL limit). */
export const RECALL_SITEMAP_CHUNK_SIZE = 10_000;

export type RecallOther = {
  source?: string | null;
  anno?: string | null;
  descrizione_dispositivo?: string | null;
  data_ultimo_aggiornamento?: string | null;
  azione?: string | null;
  pdf_data?: string | null;
  pdf_filename?: string | null;
  pdf_mime?: string | null;
  pdf_size?: string | null;
  pdf_size_bytes?: number | null;
  pdf_allegati?: unknown;
};

export type RecallRecord = {
  id: string;
  numero_riferimento: string;
  titolo_rss: string | null;
  link_pagina: string | null;
  data_pubblicazione: string | null;
  fabbricante: string | null;
  nome_dispositivo: string | null;
  tipo_dispositivo: string | null;
  data_ricezione: string | null;
  link_pdf_allegato: string | null;
  data_acquisizione: string | null;
  created_at: string | null;
  other: RecallOther;
};

export type RecallSitemapEntry = {
  numero_riferimento: string;
  lastModified: Date | undefined;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOther(raw: unknown): RecallOther {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  return {
    source: asTrimmedString(row.source),
    anno: asTrimmedString(row.anno),
    descrizione_dispositivo: asTrimmedString(row.descrizione_dispositivo),
    data_ultimo_aggiornamento: asTrimmedString(row.data_ultimo_aggiornamento),
    azione: asTrimmedString(row.azione),
    pdf_data: asTrimmedString(row.pdf_data),
    pdf_filename: asTrimmedString(row.pdf_filename),
    pdf_mime: asTrimmedString(row.pdf_mime),
    pdf_size: asTrimmedString(row.pdf_size),
    pdf_size_bytes:
      typeof row.pdf_size_bytes === "number" && Number.isFinite(row.pdf_size_bytes)
        ? row.pdf_size_bytes
        : null,
    pdf_allegati: row.pdf_allegati,
  };
}

function mapRecallRow(data: Record<string, unknown>): RecallRecord | null {
  const numero = asTrimmedString(data.numero_riferimento);
  if (!numero) return null;

  return {
    id: String(data.id),
    numero_riferimento: numero,
    titolo_rss: asTrimmedString(data.titolo_rss),
    link_pagina: asTrimmedString(data.link_pagina),
    data_pubblicazione: asTrimmedString(data.data_pubblicazione),
    fabbricante: asTrimmedString(data.fabbricante),
    nome_dispositivo: asTrimmedString(data.nome_dispositivo),
    tipo_dispositivo: asTrimmedString(data.tipo_dispositivo),
    data_ricezione: asTrimmedString(data.data_ricezione),
    link_pdf_allegato: asTrimmedString(data.link_pdf_allegato),
    data_acquisizione: asTrimmedString(data.data_acquisizione),
    created_at: asTrimmedString(data.created_at),
    other: parseOther(data.other),
  };
}

export function decodeRecallNumeroParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function recallDisplayName(recall: RecallRecord): string {
  return (
    recall.nome_dispositivo ||
    recall.titolo_rss ||
    `Avviso ${recall.numero_riferimento}`
  );
}

/** Dedup metadata + page nello stesso request. */
export const fetchRecallByNumero = cache(
  async (numero: string): Promise<RecallRecord | null> => {
    const trimmed = numero.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("recalls_medical_device")
      .select(
        `
      id,
      numero_riferimento,
      titolo_rss,
      link_pagina,
      data_pubblicazione,
      fabbricante,
      nome_dispositivo,
      tipo_dispositivo,
      data_ricezione,
      link_pdf_allegato,
      data_acquisizione,
      created_at,
      other
    `
      )
      .eq("numero_riferimento", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura avviso dispositivi medici: ${error.message}`);
    }
    if (!data) return null;

    return mapRecallRow(data as Record<string, unknown>);
  }
);

export async function countRecallsForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("recalls_medical_device")
    .select("id", { count: "exact", head: true })
    .not("numero_riferimento", "is", null)
    .not("link_pagina", "is", null);

  if (error) {
    const detail = [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(" | ");
    throw new Error(`Conteggio avvisi sitemap: ${detail || "errore sconosciuto"}`);
  }

  return count ?? 0;
}

/**
 * Stable window of recall numbers for sitemap chunking.
 * Paginates in 1000-row batches (Supabase default max).
 */
export async function fetchRecallSitemapEntries(
  offset: number,
  limit: number
): Promise<RecallSitemapEntry[]> {
  if (limit <= 0) return [];

  const entries: RecallSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    const { data, error } = await supabase
      .from("recalls_medical_device")
      .select("numero_riferimento, data_acquisizione, created_at")
      .not("numero_riferimento", "is", null)
      .not("link_pagina", "is", null)
      .order("numero_riferimento", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Lettura avvisi sitemap: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const numero = asTrimmedString(row.numero_riferimento);
      if (!numero) continue;
      const stamp = row.data_acquisizione || row.created_at;
      entries.push({
        numero_riferimento: numero,
        lastModified: stamp ? new Date(String(stamp)) : undefined,
      });
    }

    if (rows.length < to - from + 1) break;
    from = to + 1;
  }

  return entries;
}
