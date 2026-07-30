import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

/** Minimo prodotti con prezzo per pubblicare un lander tipologico. */
export const TYPE_LANDER_MIN_PRICED = 5;

export type TypeLanderSampleProduct = {
  id: string;
  pub_slug: string;
  product_name: string;
  brand: string | null;
  final_price: number;
  update_at: string | null;
};

export type TypeLander = {
  slug: string;
  seo_title: string;
  mechanical_label: string;
  product_count: number;
  priced_count: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  sample_products: TypeLanderSampleProduct[];
};

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSample(raw: unknown): TypeLanderSampleProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const pub_slug =
    typeof row.pub_slug === "string" ? row.pub_slug.trim() : null;
  const product_name =
    typeof row.product_name === "string" ? row.product_name.trim() : null;
  const final_price = asNumber(row.final_price);
  if (!id || !pub_slug || !product_name || final_price == null || final_price <= 0) {
    return null;
  }
  return {
    id,
    pub_slug,
    product_name,
    brand:
      typeof row.brand === "string" && row.brand.trim()
        ? row.brand.trim()
        : null,
    final_price,
    update_at:
      typeof row.update_at === "string" ? row.update_at : null,
  };
}

function parseLander(raw: unknown): TypeLander | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const slug = typeof row.slug === "string" ? row.slug.trim() : null;
  const seo_title =
    typeof row.seo_title === "string" && row.seo_title.trim()
      ? row.seo_title.trim()
      : typeof row.mechanical_label === "string"
        ? row.mechanical_label.trim()
        : null;
  const mechanical_label =
    typeof row.mechanical_label === "string"
      ? row.mechanical_label.trim()
      : "";
  if (!slug || !seo_title) return null;

  const samplesRaw = Array.isArray(row.sample_products)
    ? row.sample_products
    : [];
  const sample_products = samplesRaw
    .map(parseSample)
    .filter((p): p is TypeLanderSampleProduct => p != null);

  return {
    slug,
    seo_title,
    mechanical_label,
    product_count: Math.max(0, Math.trunc(asNumber(row.product_count) ?? 0)),
    priced_count: Math.max(0, Math.trunc(asNumber(row.priced_count) ?? 0)),
    avg_price: asNumber(row.avg_price),
    min_price: asNumber(row.min_price),
    max_price: asNumber(row.max_price),
    sample_products,
  };
}

/** Hub solidi: `seo_action=hub` + `kind in (type, type_or_line, brand_line)` + `lander_slug`. */
export const fetchTypeLanderBySlug = cache(
  async (slug: string): Promise<TypeLander | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase.rpc("type_lander_by_slug", {
      p_slug: trimmed,
    });
    if (error) {
      console.error("type_lander_by_slug failed:", error.message);
      return null;
    }

    const lander = parseLander(data);
    if (!lander) return null;
    if (lander.priced_count < TYPE_LANDER_MIN_PRICED) return null;
    if (lander.sample_products.length === 0) return null;
    return lander;
  }
);

export async function fetchTypeLanderSlugs(): Promise<string[]> {
  const { data, error } = await supabase.rpc("type_lander_slugs");
  if (error) {
    console.error("type_lander_slugs failed:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
}

export type TypeLanderHubItem = {
  slug: string;
  seo_title: string;
  kind: string | null;
  product_count: number;
  priced_count: number;
  avg_price: number | null;
};

function parseHubItem(raw: unknown): TypeLanderHubItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const slug = typeof row.slug === "string" ? row.slug.trim() : null;
  const seo_title =
    typeof row.seo_title === "string" ? row.seo_title.trim() : null;
  if (!slug || !seo_title) return null;
  return {
    slug,
    seo_title,
    kind: typeof row.kind === "string" ? row.kind : null,
    product_count: Math.max(0, Math.trunc(asNumber(row.product_count) ?? 0)),
    priced_count: Math.max(0, Math.trunc(asNumber(row.priced_count) ?? 0)),
    avg_price: asNumber(row.avg_price),
  };
}

/** Elenco lander per hub `/categorie` (ordinato per volume). */
export async function fetchTypeLanderHubList(): Promise<TypeLanderHubItem[]> {
  const { data, error } = await supabase.rpc("type_lander_hub_list");
  if (error) {
    console.error("type_lander_hub_list failed:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map(parseHubItem)
    .filter((item): item is TypeLanderHubItem => item != null);
}

export async function searchTypeLanders(
  query: string
): Promise<TypeLanderHubItem[]> {
  const q = query.trim().toLowerCase();
  const all = await fetchTypeLanderHubList();
  if (!q) return all;
  return all.filter((item) => {
    const hay = `${item.seo_title} ${item.slug}`.toLowerCase();
    return hay.includes(q);
  });
}
