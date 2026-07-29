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
    { original_url: string | null; discount: number | null; brand: string | null }
  >();

  for (let index = 0; index < ids.length; index += PRODUCT_URL_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + PRODUCT_URL_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("scraped_product")
      .select("id, other, discount, brand")
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

      const brandRaw = row.brand;
      const brand =
        typeof brandRaw === "string" && brandRaw.trim().length > 0
          ? brandRaw.trim()
          : null;

      detailsById.set(String(row.id), {
        original_url: parseOriginalUrl(row.other),
        discount: discount != null && discount > 0 ? discount : null,
        brand,
      });
    }
  }

  return matches.map((match) => {
    const details = detailsById.get(match.id);
    return {
      ...match,
      original_url: details?.original_url ?? match.original_url ?? null,
      discount: details?.discount ?? match.discount ?? null,
      brand: details?.brand ?? match.brand ?? null,
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

function isTransientAxeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("statement timeout") ||
    lower.includes("canceling statement") ||
    lower.includes("timed out") ||
    lower.includes("57014")
  );
}

async function matchProductsAxeBatchOnce(
  queryTexts: string[],
  matchLimit: number
): Promise<SupabaseMatch[]> {
  const t0 = Date.now();
  console.log(
    `[axe-rpc] call texts=${JSON.stringify(queryTexts)} limit=${matchLimit}`
  );

  const { data, error } = await supabase.rpc("match_products_axe_batch", {
    query_texts: queryTexts,
    match_limit: matchLimit,
  });

  if (error) {
    console.error(`[axe-rpc] ERROR after ${Date.now() - t0}ms:`, error.message);
    throw new Error(`RPC match_products_axe_batch: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  console.log(`[axe-rpc] ok ${Date.now() - t0}ms → ${rows.length} rows`);

  return rows.map((row) => ({
    query_index: Number(row.query_index),
    id: String(row.id),
    product_name: String(row.product_name ?? ""),
    final_price: Number(row.final_price ?? 0),
    ecommerce_id: String(row.ecommerce_id),
    // score grezzo del layer (non è pg_trgm similarity)
    similarity: Number(row.score ?? 0),
    original_url: null,
    discount: null,
  }));
}

/** Accetta cascata L0→L1→L1b→L1c→L2 (max ~1000). `score` mappato su similarity. */
export async function matchProductsAxeBatch(
  queryTexts: string[],
  matchLimit = 1000
): Promise<SupabaseMatch[]> {
  try {
    return await matchProductsAxeBatchOnce(queryTexts, matchLimit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientAxeError(message)) throw error;

    // Cold cache / anon 3s timeout: one retry usually succeeds warmed.
    console.warn(`[axe-rpc] transient timeout, retry once: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return matchProductsAxeBatchOnce(queryTexts, matchLimit);
  }
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
