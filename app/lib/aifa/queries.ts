import type {
  AifaAtc,
  AifaCompany,
  AifaGroup,
  AifaIngredient,
  AifaMedicine,
  AifaPriceHistoryPoint,
  AifaRelease,
  AifaSitemapEntry,
} from "@/app/lib/aifa/types";
import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBool(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mapIngredient(raw: unknown): AifaIngredient | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asTrimmedString(row.id);
  const name = asTrimmedString(row.name);
  const slug = asTrimmedString(row.slug);
  if (!id || !name || !slug) return null;
  return { id, name, slug };
}

function mapAtc(raw: unknown): AifaAtc | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asTrimmedString(row.id);
  const code = asTrimmedString(row.code);
  const slug = asTrimmedString(row.slug);
  if (!id || !code || !slug) return null;
  return { id, code, slug };
}

function mapCompany(raw: unknown): AifaCompany | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asTrimmedString(row.id);
  const name = asTrimmedString(row.name);
  const slug = asTrimmedString(row.slug);
  if (!id || !name || !slug) return null;
  return { id, name, slug };
}

function mapMedicine(data: Record<string, unknown>): AifaMedicine | null {
  const id = asTrimmedString(data.id);
  const aic = asTrimmedString(data.aic);
  const slug = asTrimmedString(data.slug);
  const name = asTrimmedString(data.name);
  if (!id || !aic || !slug || !name) return null;

  const groupRaw = data.group;
  let group: AifaMedicine["group"] = null;
  if (groupRaw && typeof groupRaw === "object" && !Array.isArray(groupRaw)) {
    const g = groupRaw as Record<string, unknown>;
    const gid = asTrimmedString(g.id);
    const code = asTrimmedString(g.code);
    const gslug = asTrimmedString(g.slug);
    if (gid && code && gslug) {
      group = {
        id: gid,
        code,
        slug: gslug,
        reference_pack_label: asTrimmedString(g.reference_pack_label),
      };
    }
  }

  return {
    id,
    aic,
    slug,
    name,
    pack_description: asTrimmedString(data.pack_description),
    prezzo_riferimento_ssn: asNumber(data.prezzo_riferimento_ssn),
    prezzo_pubblico: asNumber(data.prezzo_pubblico),
    differenza: asNumber(data.differenza),
    nota: asTrimmedString(data.nota),
    is_active: asBool(data.is_active, true),
    updated_at: asTrimmedString(data.updated_at),
    company: mapCompany(data.company),
    ingredient: mapIngredient(data.ingredient),
    group,
    atc: mapAtc(data.atc),
  };
}

const MEDICINE_SELECT = `
  id,
  aic,
  slug,
  name,
  pack_description,
  prezzo_riferimento_ssn,
  prezzo_pubblico,
  differenza,
  nota,
  is_active,
  updated_at,
  company:aifa_companies!company_id ( id, name, slug ),
  ingredient:aifa_active_ingredients!active_ingredient_id ( id, name, slug ),
  group:aifa_equivalence_groups!equivalence_group_id (
    id, code, slug, reference_pack_label
  ),
  atc:aifa_atc_codes!atc_code_id ( id, code, slug )
`;

export const fetchLatestAifaRelease = cache(
  async (): Promise<AifaRelease | null> => {
    const { data, error } = await supabase
      .from("aifa_releases")
      .select("id, published_on, row_count")
      .order("published_on", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura release AIFA: ${error.message}`);
    }
    if (!data) return null;
    const published_on = asTrimmedString(data.published_on);
    if (!published_on) return null;
    return {
      id: String(data.id),
      published_on,
      row_count:
        typeof data.row_count === "number" ? data.row_count : null,
    };
  }
);

export const fetchAifaGroupBySlug = cache(
  async (slug: string): Promise<AifaGroup | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("aifa_equivalence_groups")
      .select(
        `
        id,
        code,
        slug,
        reference_pack_label,
        active_ingredient_id,
        atc_code_id,
        ingredient:aifa_active_ingredients!active_ingredient_id ( id, name, slug ),
        atc:aifa_atc_codes!atc_code_id ( id, code, slug )
      `
      )
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura gruppo equivalenza: ${error.message}`);
    }
    if (!data) return null;

    const id = asTrimmedString(data.id);
    const code = asTrimmedString(data.code);
    const gslug = asTrimmedString(data.slug);
    if (!id || !code || !gslug) return null;

    return {
      id,
      code,
      slug: gslug,
      reference_pack_label: asTrimmedString(data.reference_pack_label),
      active_ingredient_id: asTrimmedString(data.active_ingredient_id),
      atc_code_id: asTrimmedString(data.atc_code_id),
      ingredient: mapIngredient(data.ingredient),
      atc: mapAtc(data.atc),
    };
  }
);

export const fetchActiveMedicinesByGroupId = cache(
  async (groupId: string): Promise<AifaMedicine[]> => {
    const { data, error } = await supabase
      .from("aifa_medicines")
      .select(MEDICINE_SELECT)
      .eq("equivalence_group_id", groupId)
      .eq("is_active", true)
      .order("prezzo_pubblico", { ascending: true, nullsFirst: false });

    if (error) {
      throw new Error(`Lettura farmaci del gruppo: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => mapMedicine(row as Record<string, unknown>))
      .filter((m): m is AifaMedicine => m !== null);
  }
);

export const fetchAifaIngredientBySlug = cache(
  async (slug: string): Promise<AifaIngredient | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from("aifa_active_ingredients")
      .select("id, name, slug")
      .eq("slug", trimmed)
      .maybeSingle();
    if (error) {
      throw new Error(`Lettura principio attivo: ${error.message}`);
    }
    return mapIngredient(data);
  }
);

export const fetchGroupsByIngredientId = cache(
  async (ingredientId: string): Promise<AifaGroup[]> => {
    const { data, error } = await supabase
      .from("aifa_equivalence_groups")
      .select(
        `
        id,
        code,
        slug,
        reference_pack_label,
        active_ingredient_id,
        atc_code_id,
        ingredient:aifa_active_ingredients!active_ingredient_id ( id, name, slug ),
        atc:aifa_atc_codes!atc_code_id ( id, code, slug )
      `
      )
      .eq("active_ingredient_id", ingredientId)
      .order("code", { ascending: true });

    if (error) {
      throw new Error(`Lettura gruppi per principio: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => {
        const id = asTrimmedString(row.id);
        const code = asTrimmedString(row.code);
        const slug = asTrimmedString(row.slug);
        if (!id || !code || !slug) return null;
        return {
          id,
          code,
          slug,
          reference_pack_label: asTrimmedString(row.reference_pack_label),
          active_ingredient_id: asTrimmedString(row.active_ingredient_id),
          atc_code_id: asTrimmedString(row.atc_code_id),
          ingredient: mapIngredient(row.ingredient),
          atc: mapAtc(row.atc),
        } satisfies AifaGroup;
      })
      .filter((g): g is AifaGroup => g !== null);
  }
);

export const fetchAifaMedicineBySlug = cache(
  async (slug: string): Promise<AifaMedicine | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from("aifa_medicines")
      .select(MEDICINE_SELECT)
      .eq("slug", trimmed)
      .maybeSingle();
    if (error) {
      throw new Error(`Lettura farmaco AIFA: ${error.message}`);
    }
    if (!data) return null;
    return mapMedicine(data as Record<string, unknown>);
  }
);

export const fetchMedicinePriceHistory = cache(
  async (aic: string): Promise<AifaPriceHistoryPoint[]> => {
    const trimmed = aic.trim();
    if (!trimmed) return [];
    const { data, error } = await supabase
      .from("aifa_medicine_price_history")
      .select(
        "published_on, prezzo_riferimento_ssn, prezzo_pubblico, differenza, nota, equivalence_group_code"
      )
      .eq("aic", trimmed)
      .order("published_on", { ascending: false })
      .limit(48);
    if (error) {
      throw new Error(`Lettura storico prezzi AIFA: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      published_on: String(row.published_on),
      prezzo_riferimento_ssn: asNumber(row.prezzo_riferimento_ssn),
      prezzo_pubblico: asNumber(row.prezzo_pubblico),
      differenza: asNumber(row.differenza),
      nota: asTrimmedString(row.nota),
      equivalence_group_code: asTrimmedString(row.equivalence_group_code),
    }));
  }
);

export const fetchAifaAtcBySlug = cache(
  async (slug: string): Promise<AifaAtc | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from("aifa_atc_codes")
      .select("id, code, slug")
      .eq("slug", trimmed)
      .maybeSingle();
    if (error) throw new Error(`Lettura ATC: ${error.message}`);
    return mapAtc(data);
  }
);

export const fetchGroupsByAtcId = cache(
  async (atcId: string): Promise<AifaGroup[]> => {
    const { data, error } = await supabase
      .from("aifa_equivalence_groups")
      .select(
        `
        id, code, slug, reference_pack_label, active_ingredient_id, atc_code_id,
        ingredient:aifa_active_ingredients!active_ingredient_id ( id, name, slug ),
        atc:aifa_atc_codes!atc_code_id ( id, code, slug )
      `
      )
      .eq("atc_code_id", atcId)
      .order("code", { ascending: true });
    if (error) throw new Error(`Lettura gruppi ATC: ${error.message}`);
    return (data ?? [])
      .map((row) => {
        const id = asTrimmedString(row.id);
        const code = asTrimmedString(row.code);
        const slug = asTrimmedString(row.slug);
        if (!id || !code || !slug) return null;
        return {
          id,
          code,
          slug,
          reference_pack_label: asTrimmedString(row.reference_pack_label),
          active_ingredient_id: asTrimmedString(row.active_ingredient_id),
          atc_code_id: asTrimmedString(row.atc_code_id),
          ingredient: mapIngredient(row.ingredient),
          atc: mapAtc(row.atc),
        } satisfies AifaGroup;
      })
      .filter((g): g is AifaGroup => g !== null);
  }
);

export const fetchAifaCompanyBySlug = cache(
  async (slug: string): Promise<AifaCompany | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from("aifa_companies")
      .select("id, name, slug")
      .eq("slug", trimmed)
      .maybeSingle();
    if (error) throw new Error(`Lettura ditta AIFA: ${error.message}`);
    return mapCompany(data);
  }
);

export const fetchActiveMedicinesByCompanyId = cache(
  async (companyId: string): Promise<AifaMedicine[]> => {
    const { data, error } = await supabase
      .from("aifa_medicines")
      .select(MEDICINE_SELECT)
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(200);
    if (error) throw new Error(`Lettura farmaci ditta: ${error.message}`);
    return (data ?? [])
      .map((row) => mapMedicine(row as Record<string, unknown>))
      .filter((m): m is AifaMedicine => m !== null);
  }
);

export const fetchHubSampleGroups = cache(async (): Promise<AifaGroup[]> => {
  const { data, error } = await supabase
    .from("aifa_equivalence_groups")
    .select(
      `
      id, code, slug, reference_pack_label, active_ingredient_id, atc_code_id,
      ingredient:aifa_active_ingredients!active_ingredient_id ( id, name, slug ),
      atc:aifa_atc_codes!atc_code_id ( id, code, slug )
    `
    )
    .order("code", { ascending: true })
    .limit(24);
  if (error) throw new Error(`Lettura hub gruppi AIFA: ${error.message}`);
  return (data ?? [])
    .map((row) => {
      const id = asTrimmedString(row.id);
      const code = asTrimmedString(row.code);
      const slug = asTrimmedString(row.slug);
      if (!id || !code || !slug) return null;
      return {
        id,
        code,
        slug,
        reference_pack_label: asTrimmedString(row.reference_pack_label),
        active_ingredient_id: asTrimmedString(row.active_ingredient_id),
        atc_code_id: asTrimmedString(row.atc_code_id),
        ingredient: mapIngredient(row.ingredient),
        atc: mapAtc(row.atc),
      } satisfies AifaGroup;
    })
    .filter((g): g is AifaGroup => g !== null);
});

async function countTable(
  table: string,
  activeOnly = false
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { count, error } = await q;
  if (error) throw new Error(`Conteggio ${table}: ${error.message}`);
  return count ?? 0;
}

export async function countAifaGroupsForSitemap() {
  return countTable("aifa_equivalence_groups");
}
export async function countAifaIngredientsForSitemap() {
  return countTable("aifa_active_ingredients");
}
export async function countAifaMedicinesForSitemap() {
  return countTable("aifa_medicines", true);
}
export async function countAifaCompaniesForSitemap() {
  return countTable("aifa_companies");
}
export async function countAifaAtcForSitemap() {
  return countTable("aifa_atc_codes");
}

async function fetchSlugSitemapEntries(
  table: string,
  offset: number,
  limit: number,
  activeOnly = false
): Promise<AifaSitemapEntry[]> {
  if (limit <= 0) return [];
  const entries: AifaSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    let q = supabase
      .from(table)
      .select("slug, updated_at, created_at")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, to);
    if (activeOnly) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) {
      throw new Error(`Sitemap ${table}: ${error.message}`);
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

export function fetchAifaGroupSitemapEntries(offset: number, limit: number) {
  return fetchSlugSitemapEntries("aifa_equivalence_groups", offset, limit);
}
export function fetchAifaIngredientSitemapEntries(
  offset: number,
  limit: number
) {
  return fetchSlugSitemapEntries("aifa_active_ingredients", offset, limit);
}
export function fetchAifaMedicineSitemapEntries(offset: number, limit: number) {
  return fetchSlugSitemapEntries("aifa_medicines", offset, limit, true);
}
export function fetchAifaCompanySitemapEntries(offset: number, limit: number) {
  return fetchSlugSitemapEntries("aifa_companies", offset, limit);
}
export function fetchAifaAtcSitemapEntries(offset: number, limit: number) {
  return fetchSlugSitemapEntries("aifa_atc_codes", offset, limit);
}
