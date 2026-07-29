import {
  enrichMatchesWithProductUrls,
  fetchEcommerceCatalog,
  matchProductsAxeBatch,
} from "@/app/lib/search/match-products";
import type {
  EcommerceInfo,
  SupabaseMatch,
} from "@/app/lib/search/elabora-scenari-types";

export type InlineMatchCandidate = {
  id: string;
  product_name: string;
  prezzo: number;
  similarity: number;
  ecommerce_id: string;
  ecommerce_name: string;
  logo_url: string | null;
  original_url: string | null;
  discount: number | null;
  brand: string | null;
};

/**
 * L'accetta Postgres ha già filtrato i candidati coerenti.
 * Qui: prezzo asc (highlighted = meno costoso), tie-break score desc.
 */
export function rankInlineMatches(
  matches: SupabaseMatch[],
  catalog: EcommerceInfo[]
): InlineMatchCandidate[] {
  const ecommerceById = new Map(catalog.map((item) => [item.id, item]));

  return matches
    .slice()
    .sort((a, b) => {
      const priceDelta = a.final_price - b.final_price;
      if (priceDelta !== 0) return priceDelta;
      return b.similarity - a.similarity;
    })
    .map((match) => {
      const ecommerce = ecommerceById.get(match.ecommerce_id);
      return {
        id: match.id,
        product_name: match.product_name,
        prezzo: match.final_price,
        similarity: match.similarity,
        ecommerce_id: match.ecommerce_id,
        ecommerce_name: ecommerce?.name ?? "E-commerce",
        logo_url: ecommerce?.logo_url ?? null,
        original_url: match.original_url ?? null,
        discount: match.discount ?? null,
        brand: match.brand ?? null,
      };
    });
}

export async function runInlineProductMatch(
  query: string
): Promise<InlineMatchCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const t0 = Date.now();
  console.log(`[inline-match] START query="${trimmed}"`);

  const tRpc = Date.now();
  const [rawMatches, catalog] = await Promise.all([
    matchProductsAxeBatch([trimmed], 1000),
    fetchEcommerceCatalog(),
  ]);
  const rpcMs = Date.now() - tRpc;

  const forQuery = rawMatches.filter((match) => match.query_index === 0);
  console.log(
    `[inline-match] RPC axe done in ${rpcMs}ms → ${forQuery.length} candidati, catalog=${catalog.length}`
  );

  if (forQuery.length === 0) {
    console.log(
      `[inline-match] END query="${trimmed}" empty total=${Date.now() - t0}ms`
    );
    return [];
  }

  const rankedThin = rankInlineMatches(forQuery, catalog);
  const cheapest = rankedThin[0];
  console.log(
    `[inline-match] rank prezzo: first="${cheapest?.product_name}" €${cheapest?.prezzo}`
  );

  const tEnrich = Date.now();
  const enrichIds = new Set(rankedThin.map((c) => c.id));
  const enriched = await enrichMatchesWithProductUrls(
    forQuery.filter((match) => enrichIds.has(match.id))
  );
  const enrichMs = Date.now() - tEnrich;
  console.log(
    `[inline-match] enrich done in ${enrichMs}ms → ${enriched.length} righe`
  );

  const ranked = rankInlineMatches(enriched, catalog);
  console.log(
    `[inline-match] END query="${trimmed}" matches=${ranked.length} total=${Date.now() - t0}ms (rpc=${rpcMs}ms enrich=${enrichMs}ms)`
  );

  return ranked;
}
