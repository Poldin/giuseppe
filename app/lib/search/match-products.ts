import { supabase } from "@/app/lib/SupabaseClient";
import type { EcommerceInfo, SupabaseMatch } from "@/app/lib/search/elabora-scenari-types";
import { parseShippingTiers } from "@/app/lib/search/shipping-cost";

const PRODUCT_URL_CHUNK_SIZE = 100;

function parseOriginalUrl(other: unknown): string | null {
  if (!other || typeof other !== "object") {
    return null;
  }

  const url = (other as { original_url?: unknown }).original_url;
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function enrichMatchesWithProductUrls(
  matches: SupabaseMatch[]
): Promise<SupabaseMatch[]> {
  const ids = [...new Set(matches.map((match) => match.id))];
  if (ids.length === 0) {
    return matches;
  }

  const detailsById = new Map<
    string,
    { original_url: string | null; discount: number | null }
  >();

  for (let index = 0; index < ids.length; index += PRODUCT_URL_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + PRODUCT_URL_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("scraped_product")
      .select("id, other, discount")
      .in("id", chunk);

    if (error) {
      throw new Error(`Lettura dettagli prodotti: ${error.message}`);
    }

    for (const row of data ?? []) {
      const discountRaw = row.discount;
      const discount =
        discountRaw == null || Number.isNaN(Number(discountRaw))
          ? null
          : Number(discountRaw);

      detailsById.set(String(row.id), {
        original_url: parseOriginalUrl(row.other),
        discount: discount != null && discount > 0 ? discount : null,
      });
    }
  }

  return matches.map((match) => {
    const details = detailsById.get(match.id);
    return {
      ...match,
      original_url: details?.original_url ?? match.original_url ?? null,
      discount: details?.discount ?? match.discount ?? null,
    };
  });
}

export async function matchProductsTrgmBatch(
  queryTexts: string[]
): Promise<SupabaseMatch[]> {
  const { data, error } = await supabase.rpc("match_products_trgm_batch", {
    query_texts: queryTexts,
  });

  if (error) {
    throw new Error(`RPC match_products_trgm_batch: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    query_index: Number(row.query_index),
    id: String(row.id),
    product_name: String(row.product_name ?? ""),
    final_price: Number(row.final_price ?? 0),
    ecommerce_id: String(row.ecommerce_id),
    similarity: Number(row.similarity ?? 0),
    original_url: null,
    discount: null,
  }));
}

export async function fetchEcommerceCatalog(): Promise<EcommerceInfo[]> {
  const { data, error } = await supabase
    .from("ecommerce_brand")
    .select("id, name, logo_url, domain, other");

  if (error) {
    throw new Error(`Lettura ecommerce_brand: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "E-commerce"),
    logo_url: row.logo_url ? String(row.logo_url) : null,
    domain: row.domain ? String(row.domain) : null,
    shipping_tiers: parseShippingTiers(row.other),
  }));
}
