import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;

export const DOCS_SITEMAP_CHUNK_SIZE = 10_000;

export type DocumentSourceRef = {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
};

export type ManufacturerDocumentOther = {
  raw_asset_type?: string | null;
  source_page_url?: string | null;
  thumbnail_image?: string | null;
  search_payload?: string | null;
  dam_path?: string | null;
  filter_tag?: string | null;
  filter_label?: string | null;
  locale?: string | null;
};

export type ManufacturerDocument = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  asset_type: string;
  file_url: string;
  product_name: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  updated_at: string | null;
  created_at: string | null;
  other: ManufacturerDocumentOther;
  source: DocumentSourceRef | null;
};

export type DocSitemapEntry = {
  slug: string;
  lastModified: Date | undefined;
};

export type DocSearchHit = {
  slug: string;
  title: string;
  asset_type: string;
  is_active: boolean;
  source_name: string | null;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOther(raw: unknown): ManufacturerDocumentOther {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  return {
    raw_asset_type: asTrimmedString(row.raw_asset_type),
    source_page_url: asTrimmedString(row.source_page_url),
    thumbnail_image: asTrimmedString(row.thumbnail_image),
    search_payload: asTrimmedString(row.search_payload),
    dam_path: asTrimmedString(row.dam_path),
    filter_tag: asTrimmedString(row.filter_tag),
    filter_label: asTrimmedString(row.filter_label),
    locale: asTrimmedString(row.locale),
  };
}

function mapSource(raw: unknown): DocumentSourceRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const id = asTrimmedString(row.id);
  const slug = asTrimmedString(row.slug);
  const name = asTrimmedString(row.name);
  if (!id || !slug || !name) return null;
  return {
    id,
    slug,
    name,
    domain: asTrimmedString(row.domain),
  };
}

function mapDocRow(data: Record<string, unknown>): ManufacturerDocument | null {
  const slug = asTrimmedString(data.slug);
  const title = asTrimmedString(data.title);
  const fileUrl = asTrimmedString(data.file_url);
  const assetType = asTrimmedString(data.asset_type);
  if (!slug || !title || !fileUrl || !assetType) return null;

  return {
    id: String(data.id),
    slug,
    title,
    description: asTrimmedString(data.description),
    asset_type: assetType,
    file_url: fileUrl,
    product_name: asTrimmedString(data.product_name),
    is_active: data.is_active !== false,
    last_seen_at: asTrimmedString(data.last_seen_at),
    updated_at: asTrimmedString(data.updated_at),
    created_at: asTrimmedString(data.created_at),
    other: parseOther(data.other),
    source: mapSource(data.document_sources ?? data.source),
  };
}

export function decodeDocSlugParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

const DOC_SELECT = `
  id,
  slug,
  title,
  description,
  asset_type,
  file_url,
  product_name,
  is_active,
  last_seen_at,
  updated_at,
  created_at,
  other,
  document_sources ( id, slug, name, domain )
`;

/** Dedup metadata + page nello stesso request. */
export const fetchDocumentBySlug = cache(
  async (slug: string): Promise<ManufacturerDocument | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("manufacturer_documents")
      .select(DOC_SELECT)
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura documento fabbricante: ${error.message}`);
    }
    if (!data) return null;

    return mapDocRow(data as Record<string, unknown>);
  }
);

export async function searchDocuments(
  query: string,
  limit = 40
): Promise<DocSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const safe = q.replace(/[%_,]/g, " ").replace(/\s+/g, " ").trim();
  if (!safe) return [];
  const pattern = `%${safe}%`;
  const { data, error } = await supabase
    .from("manufacturer_documents")
    .select(
      `
      slug,
      title,
      asset_type,
      is_active,
      document_sources ( name )
    `
    )
    .or(`title.ilike."${pattern}",description.ilike."${pattern}"`)
    .order("title", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Ricerca documenti: ${error.message}`);
  }

  const hits: DocSearchHit[] = [];
  for (const row of data ?? []) {
    const slug = asTrimmedString(row.slug);
    const title = asTrimmedString(row.title);
    const assetType = asTrimmedString(row.asset_type);
    if (!slug || !title || !assetType) continue;
    const source = mapSource(row.document_sources);
    hits.push({
      slug,
      title,
      asset_type: assetType,
      is_active: row.is_active !== false,
      source_name: source?.name ?? null,
    });
  }
  return hits;
}

export async function countDocsForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("manufacturer_documents")
    .select("id", { count: "exact", head: true })
    .not("slug", "is", null)
    .not("file_url", "is", null);

  if (error) {
    const detail = [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(" | ");
    throw new Error(
      `Conteggio documenti sitemap: ${detail || "errore sconosciuto"}`
    );
  }

  return count ?? 0;
}

export async function fetchDocSitemapEntries(
  offset: number,
  limit: number
): Promise<DocSitemapEntry[]> {
  if (limit <= 0) return [];

  const entries: DocSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    const { data, error } = await supabase
      .from("manufacturer_documents")
      .select("slug, updated_at, last_seen_at, created_at")
      .not("slug", "is", null)
      .not("file_url", "is", null)
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Lettura documenti sitemap: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const slug = asTrimmedString(row.slug);
      if (!slug) continue;
      const stamp = row.updated_at || row.last_seen_at || row.created_at;
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
