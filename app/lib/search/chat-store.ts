import { supabase } from "@/app/lib/SupabaseClient";
import type { RisultatoConfronto } from "@/app/lib/search/elabora-scenari";
import type { ProductSearchChat } from "@/app/lib/search/types";

function isConfronto(value: unknown): value is RisultatoConfronto {
  return (
    typeof value === "object" &&
    value !== null &&
    "tabelle_ecommerce" in value &&
    "scenario_risparmio" in value
  );
}

export async function getProductSearchChat(
  id: string
): Promise<ProductSearchChat | null> {
  const { data, error } = await supabase
    .from("product_search_chats")
    .select("id, created_at, query_text, products, results")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const results = data.results;
  const parsedResults = isConfronto(results)
    ? results
    : Array.isArray(results)
      ? results
      : [];

  return {
    id: data.id,
    created_at: data.created_at,
    query_text: data.query_text,
    products: Array.isArray(data.products) ? data.products : [],
    results: parsedResults,
  };
}

export async function saveProductSearchChat(input: {
  queryText: string;
  products: string[];
  results: RisultatoConfronto;
}): Promise<string> {
  const { data, error } = await supabase
    .from("product_search_chats")
    .insert({
      query_text: input.queryText,
      products: input.products,
      results: input.results,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Impossibile salvare la ricerca");
  }

  return data.id;
}

/** Prodotti singoli dalle ricerche pubbliche più recenti (deduplicati). */
export async function fetchRecentPublicProducts(
  limit = 20
): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_search_chats")
    .select("products")
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 3, 40));

  if (error || !data) {
    console.error("fetchRecentPublicProducts failed:", error);
    return [];
  }

  const seen = new Set<string>();
  const results: string[] = [];

  for (const row of data) {
    const products = Array.isArray(row.products)
      ? row.products.filter((item): item is string => typeof item === "string")
      : [];

    for (const product of products) {
      const trimmed = product.trim();
      if (!trimmed) continue;

      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push(trimmed);
      if (results.length >= limit) return results;
    }
  }

  return results;
}

export async function updateProductSearchChat(
  id: string,
  input: {
    products: string[];
    results: RisultatoConfronto;
  }
): Promise<void> {
  const { data, error } = await supabase
    .from("product_search_chats")
    .update({
      products: input.products,
      results: input.results,
      query_text: input.products.join(", "),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Impossibile aggiornare la ricerca");
  }

  if (!data) {
    throw new Error(
      "Aggiornamento non applicato: verifica le policy RLS UPDATE su product_search_chats"
    );
  }
}
