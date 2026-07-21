import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;

/** Same window size as pub/recall sitemap chunks (Google 50k URL limit). */
export const MEDICAL_DEVICE_SITEMAP_CHUNK_SIZE = 10_000;

export type MedicalDeviceOther = {
  source?: string | null;
  in_scope?: boolean | null;
};

export type MedicalDeviceRecord = {
  id: string;
  slug: string;
  progressivo_dm_ass: string;
  tipologia_dm: string | null;
  denominazione_commerciale: string | null;
  fabbricante_assemblatore: string | null;
  cod_fiscale: string | null;
  partita_iva_vat: string | null;
  cod_catalogo_fabbr_ass: string | null;
  classificazione_cnd: string | null;
  cnd_prefix: string | null;
  descrizione_cnd: string | null;
  iscrizione_repertorio: string | null;
  dm_riferimento: string | null;
  gruppo_dm_simili: string | null;
  data_prima_pubblicazione: string | null;
  data_inizio_validita: string | null;
  data_fine_validita: string | null;
  data_fine_commercio: string | null;
  last_source_file: string | null;
  created_at: string | null;
  updated_at: string | null;
  other: MedicalDeviceOther;
};

export type MedicalDeviceSitemapEntry = {
  slug: string;
  lastModified: Date | undefined;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOther(raw: unknown): MedicalDeviceOther {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  return {
    source: asTrimmedString(row.source),
    in_scope: typeof row.in_scope === "boolean" ? row.in_scope : null,
  };
}

function mapDeviceRow(data: Record<string, unknown>): MedicalDeviceRecord | null {
  const slug = asTrimmedString(data.slug);
  const progressivo = asTrimmedString(data.progressivo_dm_ass);
  if (!slug || !progressivo) return null;

  return {
    id: String(data.id),
    slug,
    progressivo_dm_ass: progressivo,
    tipologia_dm: asTrimmedString(data.tipologia_dm),
    denominazione_commerciale: asTrimmedString(data.denominazione_commerciale),
    fabbricante_assemblatore: asTrimmedString(data.fabbricante_assemblatore),
    cod_fiscale: asTrimmedString(data.cod_fiscale),
    partita_iva_vat: asTrimmedString(data.partita_iva_vat),
    cod_catalogo_fabbr_ass: asTrimmedString(data.cod_catalogo_fabbr_ass),
    classificazione_cnd: asTrimmedString(data.classificazione_cnd),
    cnd_prefix: asTrimmedString(data.cnd_prefix),
    descrizione_cnd: asTrimmedString(data.descrizione_cnd),
    iscrizione_repertorio: asTrimmedString(data.iscrizione_repertorio),
    dm_riferimento: asTrimmedString(data.dm_riferimento),
    gruppo_dm_simili: asTrimmedString(data.gruppo_dm_simili),
    data_prima_pubblicazione: asTrimmedString(data.data_prima_pubblicazione),
    data_inizio_validita: asTrimmedString(data.data_inizio_validita),
    data_fine_validita: asTrimmedString(data.data_fine_validita),
    data_fine_commercio: asTrimmedString(data.data_fine_commercio),
    last_source_file: asTrimmedString(data.last_source_file),
    created_at: asTrimmedString(data.created_at),
    updated_at: asTrimmedString(data.updated_at),
    other: parseOther(data.other),
  };
}

export function medicalDeviceDisplayName(device: MedicalDeviceRecord): string {
  return (
    device.denominazione_commerciale ||
    `Dispositivo ${device.progressivo_dm_ass}`
  );
}

const DEVICE_SELECT = `
  id,
  slug,
  progressivo_dm_ass,
  tipologia_dm,
  denominazione_commerciale,
  fabbricante_assemblatore,
  cod_fiscale,
  partita_iva_vat,
  cod_catalogo_fabbr_ass,
  classificazione_cnd,
  cnd_prefix,
  descrizione_cnd,
  iscrizione_repertorio,
  dm_riferimento,
  gruppo_dm_simili,
  data_prima_pubblicazione,
  data_inizio_validita,
  data_fine_validita,
  data_fine_commercio,
  last_source_file,
  created_at,
  updated_at,
  other
`;

/** Dedup metadata + page nello stesso request. */
export const fetchMedicalDeviceBySlug = cache(
  async (slug: string): Promise<MedicalDeviceRecord | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("medical_devices")
      .select(DEVICE_SELECT)
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura dispositivo medico: ${error.message}`);
    }
    if (!data) return null;

    return mapDeviceRow(data as Record<string, unknown>);
  }
);

export async function countMedicalDevicesForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("medical_devices")
    .select("id", { count: "exact", head: true })
    .not("slug", "is", null);

  if (error) {
    throw new Error(`Conteggio dispositivi medici sitemap: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Stable window of device slugs for sitemap chunking.
 * Paginates in 1000-row batches (Supabase default max).
 */
export async function fetchMedicalDeviceSitemapEntries(
  offset: number,
  limit: number
): Promise<MedicalDeviceSitemapEntry[]> {
  if (limit <= 0) return [];

  const entries: MedicalDeviceSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    const { data, error } = await supabase
      .from("medical_devices")
      .select("slug, updated_at, created_at")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Lettura dispositivi medici sitemap: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const slug = asTrimmedString(row.slug);
      if (!slug) continue;
      const stamp = row.updated_at || row.created_at;
      entries.push({
        slug,
        lastModified: stamp ? new Date(String(stamp)) : undefined,
      });
    }

    if (rows.length < to - from + 1) break;
    from = to + 1;
  }

  return entries;
}
