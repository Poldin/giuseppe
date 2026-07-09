import { elaboraConfronto } from "@/app/lib/search/elabora-scenari";
import type {
  EcommerceInfo,
  RigaTopMatch,
  RisultatoConfronto,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari-types";
import {
  enrichMatchesWithProductUrls,
  fetchEcommerceCatalog,
  matchProductsTrgmBatch,
} from "@/app/lib/search/match-products";

function shiftTopMatchRows(
  rows: RigaTopMatch[],
  insertAfterIndex: number
): RigaTopMatch[] {
  const threshold = insertAfterIndex + 1;
  return rows.map((row) =>
    row.query_index >= threshold
      ? { ...row, query_index: row.query_index + 1 }
      : row
  );
}

function mergeEcommerceTables(
  existing: TabellaEcommerce[],
  incoming: TabellaEcommerce[]
): TabellaEcommerce[] {
  const byId = new Map(existing.map((tabella) => [tabella.ecommerce_id, tabella]));

  for (const tabella of incoming) {
    if (!byId.has(tabella.ecommerce_id)) {
      byId.set(tabella.ecommerce_id, tabella);
    }
  }

  return [...byId.values()];
}

export async function addReferenzaToConfronto(
  confronto: RisultatoConfronto,
  insertAfterIndex: number,
  productName: string,
  catalogOverride?: EcommerceInfo[]
): Promise<RisultatoConfronto> {
  const trimmed = productName.trim();
  if (!trimmed) {
    throw new Error("Nome prodotto vuoto");
  }

  if (
    insertAfterIndex < -1 ||
    insertAfterIndex >= confronto.prodotti_richiesti.length
  ) {
    throw new Error("Posizione di inserimento non valida");
  }

  const newIndex = insertAfterIndex + 1;

  const [rawMatches, catalog] = await Promise.all([
    matchProductsTrgmBatch([trimmed]),
    catalogOverride ? Promise.resolve(catalogOverride) : fetchEcommerceCatalog(),
  ]);

  const enriched = await enrichMatchesWithProductUrls(rawMatches);
  const matchesForWasm = enriched.map((match) => ({
    ...match,
    query_index: 0,
  }));

  const partial = elaboraConfronto([trimmed], matchesForWasm, catalog);
  const baseRow = partial.top_match_per_referenza?.[0];

  const newRow: RigaTopMatch = baseRow
    ? {
        ...baseRow,
        query_index: newIndex,
        query_text: trimmed,
      }
    : {
        query_index: newIndex,
        query_text: trimmed,
        per_ecommerce: [],
      };

  const shiftedRows = shiftTopMatchRows(
    confronto.top_match_per_referenza ?? [],
    insertAfterIndex
  );

  const top_match_per_referenza = [...shiftedRows, newRow].sort(
    (a, b) => a.query_index - b.query_index
  );

  const prodotti_richiesti = [
    ...confronto.prodotti_richiesti.slice(0, newIndex),
    trimmed,
    ...confronto.prodotti_richiesti.slice(newIndex),
  ];

  return {
    ...confronto,
    prodotti_richiesti,
    top_match_per_referenza,
    catalogo_ecommerce: confronto.catalogo_ecommerce ?? catalog,
    tabelle_ecommerce: mergeEcommerceTables(
      confronto.tabelle_ecommerce,
      partial.tabelle_ecommerce
    ),
  };
}

function shiftTopMatchRowsAfterRemove(
  rows: RigaTopMatch[],
  removedIndex: number
): RigaTopMatch[] {
  return rows
    .filter((row) => row.query_index !== removedIndex)
    .map((row) =>
      row.query_index > removedIndex
        ? { ...row, query_index: row.query_index - 1 }
        : row
    );
}

export function removeReferenzaFromConfronto(
  confronto: RisultatoConfronto,
  queryIndex: number
): RisultatoConfronto {
  if (queryIndex < 0 || queryIndex >= confronto.prodotti_richiesti.length) {
    throw new Error("Referenza non valida");
  }

  if (confronto.prodotti_richiesti.length <= 1) {
    throw new Error("Devi mantenere almeno una referenza");
  }

  const prodotti_richiesti = confronto.prodotti_richiesti.filter(
    (_, index) => index !== queryIndex
  );

  const top_match_per_referenza = shiftTopMatchRowsAfterRemove(
    confronto.top_match_per_referenza ?? [],
    queryIndex
  );

  return {
    ...confronto,
    prodotti_richiesti,
    top_match_per_referenza,
  };
}
