export type SupabaseMatch = {
  query_index: number;
  id: string;
  product_name: string;
  final_price: number;
  ecommerce_id: string;
  similarity: number;
  original_url?: string | null;
  discount?: number | null;
  brand?: string | null;
};

export type { ShippingTier } from "@/app/lib/search/shipping-cost";

import type { ShippingTier } from "@/app/lib/search/shipping-cost";

export type EcommerceInfo = {
  id: string;
  name: string;
  logo_url: string | null;
  domain: string | null;
  shipping_tiers?: ShippingTier[];
};

export type ProdottoOfferta = {
  id: string;
  product_name: string;
  prezzo: number;
  similarity: number;
  original_url?: string | null;
  discount?: number | null;
  brand?: string | null;
};

export type VoceOrdine = {
  offerta: ProdottoOfferta;
  quantita: number;
  prezzo_riga: number;
  disponibile: boolean;
};

export type ProdottoRiga = {
  query_index: number;
  query_text: string;
  trovato: boolean;
  offerta: ProdottoOfferta | null;
  quantita?: number;
  prezzo_riga?: number;
  disponibile?: boolean;
};

export type TabellaEcommerce = {
  ecommerce_id: string;
  ecommerce_name: string;
  logo_url: string | null;
  domain: string | null;
  prezzo_prodotti: number;
  prezzo_spedizione: number;
  prezzo_totale: number;
  copertura: number;
  copertura_totale: number;
  righe: ProdottoRiga[];
};

export type ScenarioCarrello = {
  titolo: string;
  prezzo_prodotti: number;
  prezzo_spedizione: number;
  prezzo_totale: number;
  copertura: number;
  copertura_totale: number;
  ordini: Record<string, VoceOrdine[]>;
  prodotti_mancanti_indices: number[];
};

export type SelezioneUtente = {
  query_index: number;
  ecommerce_id: string;
  offerta: ProdottoOfferta;
  quantita: number;
  disponibile: boolean;
};

export type RisultatoCalcoloUtente = {
  tabelle_ecommerce: TabellaEcommerce[];
  scenario_risparmio: ScenarioCarrello;
  scenario_monopolista: ScenarioCarrello;
};

export type CandidatoEcommerce = {
  ecommerce_id: string;
  ecommerce_name: string;
  candidati: ProdottoOfferta[];
};

export type RigaTopMatch = {
  query_index: number;
  query_text: string;
  per_ecommerce: CandidatoEcommerce[];
};

export type UserCardUiState = {
  hidden: boolean;
  selected: boolean;
  quantity: number;
};

export type UserCardStateMap = Record<string, UserCardUiState>;

export type RisultatoConfronto = {
  prodotti_richiesti: string[];
  top_match_per_referenza?: RigaTopMatch[];
  catalogo_ecommerce?: EcommerceInfo[];
  tabelle_ecommerce: TabellaEcommerce[];
  scenario_risparmio: ScenarioCarrello;
  scenario_monopolista: ScenarioCarrello;
  user_card_state?: UserCardStateMap;
};

export type ElaboraConfig = {
  min_similarity: number;
};

export type ElaboraConfrontoInput = {
  prodotti_richiesti: string[];
  risultati_db: SupabaseMatch[];
  catalogo_ecommerce: EcommerceInfo[];
  min_similarity?: number;
};
