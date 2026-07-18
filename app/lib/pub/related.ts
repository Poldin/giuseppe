import {
  fetchEcommerceCatalog,
  matchProductsTrgmBatch,
} from "@/app/lib/search/match-products";
import { supabase } from "@/app/lib/SupabaseClient";
import type { PubProduct, PubProductEcommerce } from "@/app/lib/pub/product";

const RELATED_POOL_SIZE = 80;
const RELATED_DEFAULT_LIMIT = 6;

export type RelatedPubProduct = {
  id: string;
  pub_slug: string;
  product_name: string;
  brand: string | null;
  final_price: number | null;
  ecommerce: PubProductEcommerce | null;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function relatedQueryText(product: PubProduct): string {
  const parts = [product.brand, product.product_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(" ").trim();
}

/**
 * Prodotti correlati via trgm: pool dei migliori match, poi campione random.
 * Solo righe con pub_slug (link interno /pub/...).
 */
export async function fetchRelatedPubProducts(
  product: PubProduct,
  limit = RELATED_DEFAULT_LIMIT
): Promise<RelatedPubProduct[]> {
  const query = relatedQueryText(product);
  if (!query || limit <= 0) return [];

  const matches = await matchProductsTrgmBatch([query]);
  const poolIds = [
    ...new Set(
      matches
        .filter((match) => match.id !== product.id)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, RELATED_POOL_SIZE)
        .map((match) => match.id)
    ),
  ];

  if (poolIds.length === 0) return [];

  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from("scraped_product")
      .select("id, pub_slug, product_name, brand, final_price, ecommerce_id")
      .in("id", poolIds)
      .not("pub_slug", "is", null)
      .or("is_escluded.is.null,is_escluded.eq.false"),
    fetchEcommerceCatalog(),
  ]);

  if (error) {
    throw new Error(`Lettura prodotti correlati: ${error.message}`);
  }

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

  const related: RelatedPubProduct[] = [];
  for (const row of data ?? []) {
    if (!row.pub_slug) continue;
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

    related.push({
      id: String(row.id),
      pub_slug: String(row.pub_slug),
      product_name: String(row.product_name ?? "Prodotto"),
      brand,
      final_price: finalPrice,
      ecommerce: row.ecommerce_id
        ? (ecommerceById.get(String(row.ecommerce_id)) ?? null)
        : null,
    });
  }

  return shuffle(related).slice(0, limit);
}
