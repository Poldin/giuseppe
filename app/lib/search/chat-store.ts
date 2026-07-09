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
