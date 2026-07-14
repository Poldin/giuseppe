import path from "node:path";
import { createRequire } from "node:module";
import type {
  EcommerceInfo,
  ElaboraConfig,
  RisultatoConfronto,
  SupabaseMatch,
} from "@/app/lib/search/elabora-scenari-types";

export type {
  CandidatoEcommerce,
  CommittedAssignment,
  EcommerceInfo,
  ElaboraConfig,
  PendingRowChange,
  ProdottoOfferta,
  ProdottoRiga,
  RigaTopMatch,
  RisultatoCalcoloUtente,
  RisultatoConfronto,
  ScenarioCarrello,
  SelezioneUtente,
  SupabaseMatch,
  TabellaEcommerce,
  VoceOrdine,
} from "@/app/lib/search/elabora-scenari-types";

type ElaboraFn = (input: string) => string;

let elaboraFn: ElaboraFn | null = null;

function getElaboraFn(): ElaboraFn {
  if (elaboraFn) return elaboraFn;

  const pkgDir = path.join(process.cwd(), "rust/search-engine/pkg");
  const require = createRequire(path.join(pkgDir, "package.json"));
  const mod = require(path.join(pkgDir, "search_engine.js")) as {
    elaboraConfrontoWasm: ElaboraFn;
  };

  elaboraFn = mod.elaboraConfrontoWasm;
  return elaboraFn;
}

export function elaboraConfronto(
  prodottiRichiesti: string[],
  risultatiDb: SupabaseMatch[],
  catalogoEcommerce: EcommerceInfo[],
  config: ElaboraConfig = { min_similarity: 0.15 }
): RisultatoConfronto {
  const payload = JSON.stringify({
    prodotti_richiesti: prodottiRichiesti,
    risultati_db: risultatiDb,
    catalogo_ecommerce: catalogoEcommerce,
    min_similarity: config.min_similarity,
  });

  const output = getElaboraFn()(payload);
  return JSON.parse(output) as RisultatoConfronto;
}
