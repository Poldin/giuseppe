import {
  enrichMatchesWithProductUrls,
  fetchEcommerceCatalog,
  matchProductsAxeBatch,
} from "@/app/lib/search/match-products";
import type {
  EcommerceInfo,
  SupabaseMatch,
} from "@/app/lib/search/elabora-scenari-types";
import { trigramSimilarity } from "@/app/lib/search/trigram";

/** Soglia: sotto di questa, il prezzo non può “battere” il match più vicino. */
export const INLINE_TRIGRAM_PRICE_THRESHOLD = 0.8;

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

export type InlineMatchResult = {
  matches: InlineMatchCandidate[];
  selectedId: string | null;
};

type ScoredMatch = SupabaseMatch & { trigram: number };

function toCandidate(
  match: ScoredMatch,
  ecommerceById: Map<string, EcommerceInfo>
): InlineMatchCandidate {
  const ecommerce = ecommerceById.get(match.ecommerce_id);
  return {
    id: match.id,
    product_name: match.product_name,
    prezzo: match.final_price,
    similarity: match.trigram,
    ecommerce_id: match.ecommerce_id,
    ecommerce_name: ecommerce?.name ?? "E-commerce",
    logo_url: ecommerce?.logo_url ?? null,
    original_url: match.original_url ?? null,
    discount: match.discount ?? null,
    brand: match.brand ?? null,
  };
}

/**
 * Classifica per vicinanza trigram (desc), tie-break prezzo asc.
 * Scelta: tra sim ≥ T prendi il più economico; altrimenti il max sim.
 */
export function rankAndSelectInlineMatches(
  query: string,
  matches: SupabaseMatch[],
  catalog: EcommerceInfo[],
  threshold = INLINE_TRIGRAM_PRICE_THRESHOLD
): InlineMatchResult {
  const ecommerceById = new Map(catalog.map((item) => [item.id, item]));

  const scored: ScoredMatch[] = matches.map((match) => ({
    ...match,
    trigram: trigramSimilarity(query, match.product_name),
  }));

  scored.sort((a, b) => {
    const simDelta = b.trigram - a.trigram;
    if (simDelta !== 0) return simDelta;
    return a.final_price - b.final_price;
  });

  if (scored.length === 0) {
    return { matches: [], selectedId: null };
  }

  const eligible = scored.filter((m) => m.trigram >= threshold);
  let selected: ScoredMatch;
  if (eligible.length > 0) {
    selected = eligible.reduce((best, cur) => {
      if (cur.final_price < best.final_price) return cur;
      if (cur.final_price > best.final_price) return best;
      return cur.trigram > best.trigram ? cur : best;
    });
  } else {
    selected = scored[0];
  }

  return {
    matches: scored.map((m) => toCandidate(m, ecommerceById)),
    selectedId: selected.id,
  };
}

export async function runInlineProductMatch(
  query: string
): Promise<InlineMatchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { matches: [], selectedId: null };

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
    return { matches: [], selectedId: null };
  }

  const tRank = Date.now();
  const thin = rankAndSelectInlineMatches(trimmed, forQuery, catalog);
  const rankMs = Date.now() - tRank;
  const thinSelected = thin.matches.find((m) => m.id === thin.selectedId);
  console.log(
    `[inline-match] trigram rank ${rankMs}ms → selected="${thinSelected?.product_name}" sim=${thinSelected?.similarity.toFixed(3)} €${thinSelected?.prezzo}`
  );

  const tEnrich = Date.now();
  const enrichIds = new Set(thin.matches.map((c) => c.id));
  const enriched = await enrichMatchesWithProductUrls(
    forQuery.filter((match) => enrichIds.has(match.id))
  );
  const enrichMs = Date.now() - tEnrich;
  console.log(
    `[inline-match] enrich done in ${enrichMs}ms → ${enriched.length} righe`
  );

  const result = rankAndSelectInlineMatches(trimmed, enriched, catalog);
  console.log(
    `[inline-match] END query="${trimmed}" matches=${result.matches.length} total=${Date.now() - t0}ms (rpc=${rpcMs}ms rank=${rankMs}ms enrich=${enrichMs}ms)`
  );

  return result;
}
