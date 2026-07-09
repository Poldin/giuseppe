import { elaboraConfronto } from "@/app/lib/search/elabora-scenari";
import {
  enrichMatchesWithProductUrls,
  fetchEcommerceCatalog,
  matchProductsTrgmBatch,
} from "@/app/lib/search/match-products";
import type { RisultatoConfronto } from "@/app/lib/search/elabora-scenari";

export async function runProductListSearch(products: string[]): Promise<{
  products: string[];
  confronto: RisultatoConfronto;
}> {
  const cleaned = products.map((p) => p.trim()).filter(Boolean);

  if (cleaned.length === 0) {
    throw new Error("Aggiungi almeno un prodotto alla lista");
  }

  console.log("[Search] Modalità: lista prodotti + Supabase trgm + Rust/WASM");
  console.log("[Search] Prodotti in lista:", cleaned);

  const [rawMatches, catalogo] = await Promise.all([
    matchProductsTrgmBatch(cleaned),
    fetchEcommerceCatalog(),
  ]);

  const matches = await enrichMatchesWithProductUrls(rawMatches);

  console.log(`[Search] Match RPC: ${matches.length} righe`);

  const confronto = elaboraConfronto(cleaned, matches, catalogo);

  console.log(
    "[Search] Tabelle e-commerce:",
    confronto.tabelle_ecommerce.map(
      (t) =>
        `${t.ecommerce_name} (${t.copertura}/${t.copertura_totale}) €${t.prezzo_totale.toFixed(2)}`
    )
  );

  return { products: cleaned, confronto };
}
