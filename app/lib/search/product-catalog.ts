import { supabase } from "@/app/lib/SupabaseClient";
import { matchProductsTrgmBatch } from "@/app/lib/search/match-products";

export type CatalogHit = {
  id: string;
  product_name: string;
  final_price: number | null;
  similarity: number;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function searchProductsSemantic(
  query: string,
  limit = 10
): Promise<CatalogHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const matches = await matchProductsTrgmBatch([trimmed]);
  const byName = new Map<string, CatalogHit>();

  for (const match of matches) {
    const key = match.product_name.trim().toLowerCase();
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing || match.similarity > existing.similarity) {
      byName.set(key, {
        id: match.id,
        product_name: match.product_name,
        final_price: match.final_price,
        similarity: match.similarity,
      });
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function fetchRandomProductSuggestions(
  count = 15
): Promise<string[]> {
  const { data, error } = await supabase
    .from("scraped_product")
    .select("product_name")
    .not("product_name", "is", null)
    .limit(120);

  if (error || !data) {
    throw new Error(`Lettura suggerimenti: ${error?.message ?? "sconosciuto"}`);
  }

  const unique = [
    ...new Set(
      data
        .map((row) => String(row.product_name ?? "").trim())
        .filter(Boolean)
    ),
  ];

  return shuffle(unique).slice(0, count);
}
