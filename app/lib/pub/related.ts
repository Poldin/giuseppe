import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";
import { supabase } from "@/app/lib/SupabaseClient";
import type { PubProduct, PubProductEcommerce } from "@/app/lib/pub/product";
import { unstable_cache } from "next/cache";

/** Allineato a `revalidate` di `/pub/[slug]`. */
export const RELATED_REVALIDATE_SECONDS = 43200;

/** Quanti recenti per ecommerce nel pool condiviso. */
const RELATED_PER_SHOP = 10;
const RELATED_DEFAULT_LIMIT = 6;

export type RelatedPubProduct = {
  id: string;
  pub_slug: string;
  product_name: string;
  brand: string | null;
  final_price: number | null;
  ecommerce: PubProductEcommerce | null;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Shuffle stabile (niente Math.random → non rompe ISR). */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const copy = [...items];
  let state = hashSeed(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mapRow(
  row: {
    id?: unknown;
    pub_slug?: unknown;
    product_name?: unknown;
    brand?: unknown;
    final_price?: unknown;
    ecommerce_id?: unknown;
  },
  ecommerceById: Map<string, PubProductEcommerce>
): RelatedPubProduct | null {
  if (typeof row.pub_slug !== "string" || !row.pub_slug.trim()) return null;
  if (row.id == null) return null;

  const priceRaw = row.final_price;
  const finalPrice =
    priceRaw == null || Number.isNaN(Number(priceRaw))
      ? null
      : Number(priceRaw);
  const brandRaw = row.brand;
  const brand =
    typeof brandRaw === "string" && brandRaw.trim().length > 0
      ? brandRaw.trim()
      : null;
  const ecommerceId =
    row.ecommerce_id != null ? String(row.ecommerce_id) : null;

  return {
    id: String(row.id),
    pub_slug: row.pub_slug.trim(),
    product_name: String(row.product_name ?? "Prodotto"),
    brand,
    final_price: finalPrice,
    ecommerce: ecommerceId
      ? (ecommerceById.get(ecommerceId) ?? null)
      : null,
  };
}

/**
 * Round-robin tra shop dopo shuffle: mix visibile, non 6 dello stesso ecommerce.
 */
function pickDiverse(
  candidates: RelatedPubProduct[],
  seed: string,
  limit: number
): RelatedPubProduct[] {
  const shuffled = seededShuffle(candidates, seed);
  const byShop = new Map<string, RelatedPubProduct[]>();

  for (const item of shuffled) {
    const key = item.ecommerce?.id ?? "_";
    const list = byShop.get(key) ?? [];
    list.push(item);
    byShop.set(key, list);
  }

  const shopKeys = seededShuffle([...byShop.keys()], `${seed}:shops`);
  const result: RelatedPubProduct[] = [];
  let round = 0;

  while (result.length < limit) {
    let added = false;
    for (const key of shopKeys) {
      const item = byShop.get(key)?.[round];
      if (!item) continue;
      result.push(item);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }

  return result;
}

/**
 * Pool bilanciato per ecommerce — cache ISR 12h, una volta per tutte le schede.
 */
const getCachedBalancedPubPool = unstable_cache(
  async (): Promise<RelatedPubProduct[]> => {
    const catalog = await fetchEcommerceCatalog();
    if (catalog.length === 0) return [];

    const ecommerceById = new Map(
      catalog.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          logo_url: item.logo_url,
          domain: item.domain,
        } satisfies PubProductEcommerce,
      ])
    );

    const batches = await Promise.all(
      catalog.map(async (shop) => {
        const { data, error } = await supabase
          .from("scraped_product")
          .select(
            "id, pub_slug, product_name, brand, final_price, ecommerce_id"
          )
          .eq("ecommerce_id", shop.id)
          .not("pub_slug", "is", null)
          .not("is_escluded", "is", true)
          .order("update_at", { ascending: false, nullsFirst: false })
          .limit(RELATED_PER_SHOP);

        if (error) {
          throw new Error(
            `Lettura correlati ${shop.name}: ${error.message}`
          );
        }

        const hits: RelatedPubProduct[] = [];
        for (const row of data ?? []) {
          const mapped = mapRow(row, ecommerceById);
          if (mapped) hits.push(mapped);
        }
        return hits;
      })
    );

    return batches.flat();
  },
  ["pub-related-balanced-pool-v1"],
  { revalidate: RELATED_REVALIDATE_SECONDS }
);

/**
 * Campione “random” misto tra ecommerce (escluso il corrente).
 * Pool in ISR; ordine deterministico per product.id.
 */
export async function fetchRelatedPubProducts(
  product: PubProduct,
  limit = RELATED_DEFAULT_LIMIT
): Promise<RelatedPubProduct[]> {
  if (limit <= 0) return [];

  const pool = await getCachedBalancedPubPool();
  const candidates = pool.filter((item) => item.id !== product.id);
  return pickDiverse(candidates, product.id, limit);
}

/** Stesso pool ISR delle schede /pub — seed fisso per la home. */
export async function fetchHomeRelatedPubProducts(
  limit = RELATED_DEFAULT_LIMIT
): Promise<RelatedPubProduct[]> {
  if (limit <= 0) return [];

  const pool = await getCachedBalancedPubPool();
  return pickDiverse(pool, "home", limit);
}
