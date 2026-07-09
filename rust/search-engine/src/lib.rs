use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Singola riga restituita dalla RPC `match_products_trgm_batch`.
#[derive(Debug, Clone, Deserialize)]
pub struct SupabaseMatch {
    pub query_index: i32,
    pub id: String,
    pub product_name: String,
    pub final_price: f32,
    pub ecommerce_id: String,
    pub similarity: f32,
    #[serde(default)]
    pub original_url: Option<String>,
    #[serde(default)]
    pub discount: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShippingTier {
    pub min_value: f32,
    pub max_value: Option<f32>,
    pub shipping_cost: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcommerceInfo {
    pub id: String,
    pub name: String,
    pub logo_url: Option<String>,
    pub domain: Option<String>,
    #[serde(default)]
    pub shipping_tiers: Vec<ShippingTier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProdottoOfferta {
    pub id: String,
    pub product_name: String,
    pub prezzo: f32,
    pub similarity: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discount: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoceOrdine {
    pub offerta: ProdottoOfferta,
    pub quantita: u32,
    pub prezzo_riga: f32,
    pub disponibile: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProdottoRiga {
    pub query_index: i32,
    pub query_text: String,
    pub trovato: bool,
    pub offerta: Option<ProdottoOfferta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantita: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prezzo_riga: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disponibile: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabellaEcommerce {
    pub ecommerce_id: String,
    pub ecommerce_name: String,
    pub logo_url: Option<String>,
    pub domain: Option<String>,
    pub prezzo_prodotti: f32,
    pub prezzo_spedizione: f32,
    pub prezzo_totale: f32,
    pub copertura: usize,
    pub copertura_totale: usize,
    pub righe: Vec<ProdottoRiga>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioCarrello {
    pub titolo: String,
    pub prezzo_prodotti: f32,
    pub prezzo_spedizione: f32,
    pub prezzo_totale: f32,
    pub copertura: usize,
    pub copertura_totale: usize,
    pub ordini: HashMap<String, Vec<VoceOrdine>>,
    pub prodotti_mancanti_indices: Vec<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SelezioneUtente {
    pub query_index: i32,
    pub ecommerce_id: String,
    pub offerta: ProdottoOfferta,
    pub quantita: u32,
    #[serde(default = "default_disponibile")]
    pub disponibile: bool,
}

fn default_disponibile() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidatoEcommerce {
    pub ecommerce_id: String,
    pub ecommerce_name: String,
    pub candidati: Vec<ProdottoOfferta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RigaTopMatch {
    pub query_index: i32,
    pub query_text: String,
    pub per_ecommerce: Vec<CandidatoEcommerce>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RisultatoConfronto {
    pub prodotti_richiesti: Vec<String>,
    pub top_match_per_referenza: Vec<RigaTopMatch>,
    pub catalogo_ecommerce: Vec<EcommerceInfo>,
    pub tabelle_ecommerce: Vec<TabellaEcommerce>,
    pub scenario_risparmio: ScenarioCarrello,
    pub scenario_monopolista: ScenarioCarrello,
}

#[derive(Debug, Clone)]
pub struct ElaboraConfig {
    pub min_similarity: f32,
}

impl Default for ElaboraConfig {
    fn default() -> Self {
        Self {
            min_similarity: 0.15,
        }
    }
}

const MAX_CANDIDATI_PER_ECOMMERCE: usize = 10;

type MatriceOfferte = HashMap<i32, HashMap<String, ProdottoOfferta>>;
type MatriceCandidati = HashMap<i32, HashMap<String, Vec<ProdottoOfferta>>>;
type MatriceUtente = HashMap<i32, HashMap<String, VoceOrdine>>;

fn prezzo_riga(offerta: &ProdottoOfferta, quantita: u32) -> f32 {
    offerta.prezzo * quantita as f32
}

fn voce_ordine(offerta: ProdottoOfferta, quantita: u32, disponibile: bool) -> VoceOrdine {
    VoceOrdine {
        prezzo_riga: prezzo_riga(&offerta, quantita),
        quantita,
        disponibile,
        offerta,
    }
}

fn calcola_spedizione(prezzo_prodotti: f32, tiers: &[ShippingTier]) -> f32 {
    if prezzo_prodotti <= 0.0 || tiers.is_empty() {
        return 0.0;
    }

    for tier in tiers {
        let min_ok = prezzo_prodotti >= tier.min_value;
        let max_ok = tier
            .max_value
            .map(|max| prezzo_prodotti <= max)
            .unwrap_or(true);

        if min_ok && max_ok {
            return tier.shipping_cost;
        }
    }

    0.0
}

fn delta_spedizione(subtotale_prima: f32, subtotale_dopo: f32, tiers: &[ShippingTier]) -> f32 {
    calcola_spedizione(subtotale_dopo, tiers) - calcola_spedizione(subtotale_prima, tiers)
}

fn spedizione_ecommerce_ordine(
    ecom_id: &str,
    prezzo_prodotti: f32,
    catalogo: &[EcommerceInfo],
) -> f32 {
    let info = lookup_ecommerce(ecom_id, catalogo);
    calcola_spedizione(prezzo_prodotti, &info.shipping_tiers)
}

fn spedizione_ordini(
    ordini: &HashMap<String, Vec<VoceOrdine>>,
    catalogo: &[EcommerceInfo],
) -> f32 {
    ordini
        .iter()
        .map(|(ecom_id, voci)| {
            let subtotale: f32 = voci.iter().map(|v| v.prezzo_riga).sum();
            spedizione_ecommerce_ordine(ecom_id, subtotale, catalogo)
        })
        .sum()
}

fn build_matrice_utente(selezioni: &[SelezioneUtente]) -> MatriceUtente {
    let mut matrice: MatriceUtente = HashMap::new();

    for sel in selezioni {
        if sel.quantita == 0 {
            continue;
        }

        let quantita = sel.quantita.max(1);
        matrice
            .entry(sel.query_index)
            .or_default()
            .insert(
                sel.ecommerce_id.clone(),
                voce_ordine(sel.offerta.clone(), quantita, sel.disponibile),
            );
    }

    matrice
}

fn matrice_to_selezioni(matrice: &MatriceOfferte) -> Vec<SelezioneUtente> {
    let mut selezioni = Vec::new();

    for (query_index, ecom_map) in matrice {
        for (ecommerce_id, offerta) in ecom_map {
            selezioni.push(SelezioneUtente {
                query_index: *query_index,
                ecommerce_id: ecommerce_id.clone(),
                offerta: offerta.clone(),
                quantita: 1,
                disponibile: true,
            });
        }
    }

    selezioni
}

fn ecommerce_ids_in_matrice_utente(matrice: &MatriceUtente) -> Vec<String> {
    let mut ids = HashSet::new();
    for offerte in matrice.values() {
        for ecom_id in offerte.keys() {
            ids.insert(ecom_id.clone());
        }
    }
    let mut list: Vec<String> = ids.into_iter().collect();
    list.sort();
    list
}

fn prodotto_offerta_from_match(m: &SupabaseMatch) -> ProdottoOfferta {
    ProdottoOfferta {
        id: m.id.clone(),
        product_name: m.product_name.clone(),
        prezzo: m.final_price,
        similarity: m.similarity,
        original_url: m.original_url.clone(),
        discount: m.discount,
    }
}

fn sort_matches<'a>(risultati_db: &'a [SupabaseMatch]) -> Vec<&'a SupabaseMatch> {
    let mut sorted: Vec<&SupabaseMatch> = risultati_db.iter().collect();
    sorted.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                a.final_price
                    .partial_cmp(&b.final_price)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    sorted
}

fn build_top_match_per_referenza(
    prodotti_richiesti: &[String],
    risultati_db: &[SupabaseMatch],
    catalogo: &[EcommerceInfo],
    config: &ElaboraConfig,
) -> Vec<RigaTopMatch> {
    let mut matrice: MatriceCandidati = HashMap::new();

    for m in sort_matches(risultati_db) {
        if m.query_index < 0 || m.query_index as usize >= prodotti_richiesti.len() {
            continue;
        }
        if m.similarity < config.min_similarity {
            continue;
        }

        let ecom_map = matrice.entry(m.query_index).or_default();
        let candidati = ecom_map.entry(m.ecommerce_id.clone()).or_default();

        if candidati.len() >= MAX_CANDIDATI_PER_ECOMMERCE {
            continue;
        }
        if candidati.iter().any(|c| c.id == m.id) {
            continue;
        }

        candidati.push(prodotto_offerta_from_match(m));
    }

    prodotti_richiesti
        .iter()
        .enumerate()
        .map(|(idx, query_text)| {
            let query_index = idx as i32;
            let mut per_ecommerce: Vec<CandidatoEcommerce> = matrice
                .get(&query_index)
                .map(|ecom_map| {
                    ecom_map
                        .iter()
                        .map(|(ecom_id, candidati)| {
                            let info = lookup_ecommerce(ecom_id, catalogo);
                            CandidatoEcommerce {
                                ecommerce_id: ecom_id.clone(),
                                ecommerce_name: info.name,
                                candidati: candidati.clone(),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();

            per_ecommerce.sort_by(|a, b| a.ecommerce_name.cmp(&b.ecommerce_name));

            RigaTopMatch {
                query_index,
                query_text: query_text.clone(),
                per_ecommerce,
            }
        })
        .collect()
}

fn build_matrice(
    prodotti_richiesti: &[String],
    risultati_db: &[SupabaseMatch],
    config: &ElaboraConfig,
) -> MatriceOfferte {
    let mut matrice: MatriceOfferte = HashMap::new();

    for m in sort_matches(risultati_db) {
        if m.query_index < 0 || m.query_index as usize >= prodotti_richiesti.len() {
            continue;
        }
        if m.similarity < config.min_similarity {
            continue;
        }

        let ecom_map = matrice.entry(m.query_index).or_default();
        ecom_map
            .entry(m.ecommerce_id.clone())
            .or_insert_with(|| prodotto_offerta_from_match(m));
    }

    matrice
}

fn ecommerce_ids_in_matrice(matrice: &MatriceOfferte) -> Vec<String> {
    let mut ids = HashSet::new();
    for offerte in matrice.values() {
        for ecom_id in offerte.keys() {
            ids.insert(ecom_id.clone());
        }
    }
    let mut list: Vec<String> = ids.into_iter().collect();
    list.sort();
    list
}

fn lookup_ecommerce(ecom_id: &str, catalogo: &[EcommerceInfo]) -> EcommerceInfo {
    catalogo
        .iter()
        .find(|e| e.id == ecom_id)
        .cloned()
        .unwrap_or_else(|| EcommerceInfo {
            id: ecom_id.to_string(),
            name: ecom_id.to_string(),
            logo_url: None,
            domain: None,
            shipping_tiers: Vec::new(),
        })
}

/// Costruisce una tabella per ogni e-commerce con le selezioni utente.
pub fn build_tabelle_ecommerce_utente(
    prodotti_richiesti: &[String],
    matrice: &MatriceUtente,
    catalogo: &[EcommerceInfo],
) -> Vec<TabellaEcommerce> {
    let n = prodotti_richiesti.len();
    let mut tabelle = Vec::new();

    for ecom_id in ecommerce_ids_in_matrice_utente(matrice) {
        let info = lookup_ecommerce(&ecom_id, catalogo);
        let mut righe = Vec::with_capacity(n);
        let mut prezzo_prodotti = 0.0_f32;
        let mut copertura = 0_usize;

        for idx in 0..n {
            let query_index = idx as i32;
            let voce = matrice
                .get(&query_index)
                .and_then(|offerte| offerte.get(&ecom_id))
                .cloned();

            if let Some(ref v) = voce {
                if v.disponibile {
                    copertura += 1;
                    prezzo_prodotti += v.prezzo_riga;
                }
            }

            righe.push(ProdottoRiga {
                query_index,
                query_text: prodotti_richiesti[idx].clone(),
                trovato: voce.is_some(),
                offerta: voce.as_ref().map(|v| v.offerta.clone()),
                quantita: voce.as_ref().map(|v| v.quantita),
                prezzo_riga: voce.as_ref().map(|v| v.prezzo_riga),
                disponibile: voce.as_ref().map(|v| v.disponibile),
            });
        }

        let prezzo_spedizione = if copertura > 0 {
            spedizione_ecommerce_ordine(&ecom_id, prezzo_prodotti, catalogo)
        } else {
            0.0
        };

        tabelle.push(TabellaEcommerce {
            ecommerce_id: ecom_id,
            ecommerce_name: info.name.clone(),
            logo_url: info.logo_url.clone(),
            domain: info.domain.clone(),
            prezzo_prodotti,
            prezzo_spedizione,
            prezzo_totale: prezzo_prodotti + prezzo_spedizione,
            copertura,
            copertura_totale: n,
            righe,
        });
    }

    tabelle.sort_by(|a, b| {
        b.copertura
            .cmp(&a.copertura)
            .then_with(|| {
                a.prezzo_totale
                    .partial_cmp(&b.prezzo_totale)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    tabelle
}

fn build_scenario_risparmio_utente(
    n: usize,
    matrice: &MatriceUtente,
    catalogo: &[EcommerceInfo],
) -> ScenarioCarrello {
    let mut ordini: HashMap<String, Vec<VoceOrdine>> = HashMap::new();
    let mut subtotals: HashMap<String, f32> = HashMap::new();
    let mut prezzo_prodotti = 0.0_f32;
    let mut copertura = 0_usize;
    let mut mancanti = Vec::new();

    for idx in 0..n {
        let query_index = idx as i32;
        if let Some(offerte) = matrice.get(&query_index) {
            let mut migliore: Option<(String, VoceOrdine)> = None;
            let mut miglior_costo = f32::MAX;

            for (ecom_id, voce) in offerte {
                if !voce.disponibile {
                    continue;
                }

                let subtotale_prima = *subtotals.get(ecom_id).unwrap_or(&0.0);
                let subtotale_dopo = subtotale_prima + voce.prezzo_riga;
                let info = lookup_ecommerce(ecom_id, catalogo);
                let costo_marginal = voce.prezzo_riga
                    + delta_spedizione(subtotale_prima, subtotale_dopo, &info.shipping_tiers);

                if costo_marginal < miglior_costo {
                    miglior_costo = costo_marginal;
                    migliore = Some((ecom_id.clone(), voce.clone()));
                }
            }

            if let Some((ecom_id, voce)) = migliore {
                ordini.entry(ecom_id.clone()).or_default().push(voce.clone());
                *subtotals.entry(ecom_id).or_insert(0.0) += voce.prezzo_riga;
                prezzo_prodotti += voce.prezzo_riga;
                copertura += 1;
            } else {
                mancanti.push(query_index);
            }
        } else {
            mancanti.push(query_index);
        }
    }

    let prezzo_spedizione = spedizione_ordini(&ordini, catalogo);

    ScenarioCarrello {
        titolo: "Risparmio assoluto".to_string(),
        prezzo_prodotti,
        prezzo_spedizione,
        prezzo_totale: prezzo_prodotti + prezzo_spedizione,
        copertura,
        copertura_totale: n,
        ordini,
        prodotti_mancanti_indices: mancanti,
    }
}

fn build_scenario_monopolista_utente(
    n: usize,
    matrice: &MatriceUtente,
    catalogo: &[EcommerceInfo],
) -> ScenarioCarrello {
    let ecommerce_ids = ecommerce_ids_in_matrice_utente(matrice);

    let mut miglior_ecom = String::new();
    let mut max_copertura = 0_usize;
    let mut minor_prezzo = f32::MAX;
    let mut miglior_ordini: HashMap<String, Vec<VoceOrdine>> = HashMap::new();

    for ecom_id in &ecommerce_ids {
        let mut copertura = 0_usize;
        let mut prezzo_prodotti = 0.0_f32;
        let mut prodotti = Vec::new();

        for idx in 0..n {
            let query_index = idx as i32;
            if let Some(voce) = matrice
                .get(&query_index)
                .and_then(|offerte| offerte.get(ecom_id))
            {
                if !voce.disponibile {
                    continue;
                }

                copertura += 1;
                prezzo_prodotti += voce.prezzo_riga;
                prodotti.push(voce.clone());
            }
        }

        let prezzo_spedizione = if copertura > 0 {
            spedizione_ecommerce_ordine(ecom_id, prezzo_prodotti, catalogo)
        } else {
            0.0
        };
        let prezzo_totale = prezzo_prodotti + prezzo_spedizione;

        let migliore = copertura > max_copertura
            || (copertura == max_copertura && prezzo_totale < minor_prezzo);

        if migliore {
            max_copertura = copertura;
            minor_prezzo = prezzo_totale;
            miglior_ecom = ecom_id.clone();
            miglior_ordini = HashMap::new();
            if !ecom_id.is_empty() {
                miglior_ordini.insert(ecom_id.clone(), prodotti);
            }
        }
    }

    let mut mancanti = Vec::new();
    for idx in 0..n {
        let query_index = idx as i32;
        let trovato = matrice
            .get(&query_index)
            .and_then(|offerte| offerte.get(&miglior_ecom))
            .map(|voce| voce.disponibile)
            .unwrap_or(false);
        if !trovato {
            mancanti.push(query_index);
        }
    }

    let prezzo_prodotti: f32 = miglior_ordini
        .values()
        .flatten()
        .map(|voce| voce.prezzo_riga)
        .sum();
    let prezzo_spedizione = spedizione_ordini(&miglior_ordini, catalogo);

    ScenarioCarrello {
        titolo: "Massima comodità (un solo e-commerce)".to_string(),
        prezzo_prodotti,
        prezzo_spedizione,
        prezzo_totale: if minor_prezzo == f32::MAX {
            0.0
        } else {
            prezzo_prodotti + prezzo_spedizione
        },
        copertura: max_copertura,
        copertura_totale: n,
        ordini: miglior_ordini,
        prodotti_mancanti_indices: mancanti,
    }
}

pub fn elabora_confronto_utente(
    prodotti_richiesti: Vec<String>,
    selezioni: Vec<SelezioneUtente>,
    catalogo_ecommerce: Vec<EcommerceInfo>,
) -> RisultatoCalcoloUtente {
    let n = prodotti_richiesti.len();
    let matrice = build_matrice_utente(&selezioni);

    RisultatoCalcoloUtente {
        tabelle_ecommerce: build_tabelle_ecommerce_utente(
            &prodotti_richiesti,
            &matrice,
            &catalogo_ecommerce,
        ),
        scenario_risparmio: build_scenario_risparmio_utente(n, &matrice, &catalogo_ecommerce),
        scenario_monopolista: build_scenario_monopolista_utente(n, &matrice, &catalogo_ecommerce),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RisultatoCalcoloUtente {
    pub tabelle_ecommerce: Vec<TabellaEcommerce>,
    pub scenario_risparmio: ScenarioCarrello,
    pub scenario_monopolista: ScenarioCarrello,
}

/// Entry point: riceve prodotti richiesti, match RPC e catalogo e-commerce.
pub fn elabora_confronto(
    prodotti_richiesti: Vec<String>,
    risultati_db: Vec<SupabaseMatch>,
    catalogo_ecommerce: Vec<EcommerceInfo>,
    config: Option<ElaboraConfig>,
) -> RisultatoConfronto {
    let config = config.unwrap_or_default();
    let matrice = build_matrice(&prodotti_richiesti, &risultati_db, &config);
    let top_match_per_referenza =
        build_top_match_per_referenza(&prodotti_richiesti, &risultati_db, &catalogo_ecommerce, &config);

    let selezioni = matrice_to_selezioni(&matrice);
    let catalogo_ecommerce_clone = catalogo_ecommerce.clone();
    let calcolo = elabora_confronto_utente(
        prodotti_richiesti.clone(),
        selezioni,
        catalogo_ecommerce,
    );

    RisultatoConfronto {
        prodotti_richiesti,
        top_match_per_referenza,
        catalogo_ecommerce: catalogo_ecommerce_clone,
        tabelle_ecommerce: calcolo.tabelle_ecommerce,
        scenario_risparmio: calcolo.scenario_risparmio,
        scenario_monopolista: calcolo.scenario_monopolista,
    }
}

/// Wrapper JSON per integrazione da Node/WASM.
pub fn elabora_confronto_utente_json(input: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Input {
        prodotti_richiesti: Vec<String>,
        selezioni: Vec<SelezioneUtente>,
        catalogo_ecommerce: Vec<EcommerceInfo>,
    }

    let parsed: Input =
        serde_json::from_str(input).map_err(|e| format!("JSON input non valido: {e}"))?;

    let result = elabora_confronto_utente(
        parsed.prodotti_richiesti,
        parsed.selezioni,
        parsed.catalogo_ecommerce,
    );

    serde_json::to_string(&result).map_err(|e| format!("JSON output non valido: {e}"))
}

/// Wrapper JSON per integrazione da Node/WASM.
pub fn elabora_confronto_json(input: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Input {
        prodotti_richiesti: Vec<String>,
        risultati_db: Vec<SupabaseMatch>,
        catalogo_ecommerce: Vec<EcommerceInfo>,
        min_similarity: Option<f32>,
    }

    let parsed: Input =
        serde_json::from_str(input).map_err(|e| format!("JSON input non valido: {e}"))?;

    let config = ElaboraConfig {
        min_similarity: parsed.min_similarity.unwrap_or(0.15),
    };

    let result = elabora_confronto(
        parsed.prodotti_richiesti,
        parsed.risultati_db,
        parsed.catalogo_ecommerce,
        Some(config),
    );

    serde_json::to_string(&result).map_err(|e| format!("JSON output non valido: {e}"))
}

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = elaboraConfrontoUtenteWasm)]
pub fn elabora_confronto_utente_wasm(input: &str) -> Result<String, JsValue> {
    elabora_confronto_utente_json(input).map_err(|e| JsValue::from_str(&e))
}

/// Entry point WASM/Node esposto a JavaScript via wasm-bindgen.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = elaboraConfrontoWasm)]
pub fn elabora_confronto_wasm(input: &str) -> Result<String, JsValue> {
    elabora_confronto_json(input).map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_catalogo() -> Vec<EcommerceInfo> {
        vec![
            EcommerceInfo {
                id: "e1".into(),
                name: "Dentaltix".into(),
                logo_url: None,
                domain: Some("dentaltix.com".into()),
                shipping_tiers: Vec::new(),
            },
            EcommerceInfo {
                id: "e2".into(),
                name: "Gerho".into(),
                logo_url: None,
                domain: Some("gerho.it".into()),
                shipping_tiers: Vec::new(),
            },
        ]
    }

    #[test]
    fn ordina_tabelle_per_copertura_poi_prezzo() {
        let prodotti = vec!["guanti".into(), "composito".into()];
        let matches = vec![
            SupabaseMatch {
                query_index: 0,
                id: "a".into(),
                product_name: "Guanti nitrile".into(),
                final_price: 10.0,
                ecommerce_id: "e1".into(),
                similarity: 0.8,
                original_url: None,
                discount: None,
            },
            SupabaseMatch {
                query_index: 1,
                id: "b".into(),
                product_name: "Composito A".into(),
                final_price: 30.0,
                ecommerce_id: "e1".into(),
                similarity: 0.7,
                original_url: None,
                discount: None,
            },
            SupabaseMatch {
                query_index: 0,
                id: "c".into(),
                product_name: "Guanti".into(),
                final_price: 12.0,
                ecommerce_id: "e2".into(),
                similarity: 0.75,
                original_url: None,
                discount: None,
            },
        ];

        let result = elabora_confronto(prodotti, matches, sample_catalogo(), None);

        assert_eq!(result.tabelle_ecommerce.len(), 2);
        assert_eq!(result.tabelle_ecommerce[0].ecommerce_id, "e1");
        assert_eq!(result.tabelle_ecommerce[0].copertura, 2);
        assert_eq!(result.tabelle_ecommerce[0].prezzo_totale, 40.0);
        assert_eq!(result.scenario_risparmio.prezzo_totale, 40.0);
    }

    #[test]
    fn top_match_per_referenza_fino_a_dieci_per_ecommerce() {
        let prodotti = vec!["guanti".into()];
        let mut matches = Vec::new();

        for i in 0..12 {
            matches.push(SupabaseMatch {
                query_index: 0,
                id: format!("e1-{i}"),
                product_name: format!("Guanti variant {i}"),
                final_price: 10.0 + i as f32,
                ecommerce_id: "e1".into(),
                similarity: 0.9 - i as f32 * 0.01,
                original_url: None,
                discount: None,
            });
        }

        for i in 0..3 {
            matches.push(SupabaseMatch {
                query_index: 0,
                id: format!("e2-{i}"),
                product_name: format!("Guanti alt {i}"),
                final_price: 8.0 + i as f32,
                ecommerce_id: "e2".into(),
                similarity: 0.85 - i as f32 * 0.05,
                original_url: None,
                discount: None,
            });
        }

        let result = elabora_confronto(prodotti, matches, sample_catalogo(), None);

        assert_eq!(result.top_match_per_referenza.len(), 1);
        let riga = &result.top_match_per_referenza[0];
        assert_eq!(riga.query_text, "guanti");
        assert_eq!(riga.per_ecommerce.len(), 2);

        let dentaltix = riga
            .per_ecommerce
            .iter()
            .find(|e| e.ecommerce_id == "e1")
            .expect("dentaltix");
        assert_eq!(dentaltix.candidati.len(), 10);
        assert_eq!(dentaltix.candidati[0].id, "e1-0");

        let gerho = riga
            .per_ecommerce
            .iter()
            .find(|e| e.ecommerce_id == "e2")
            .expect("gerho");
        assert_eq!(gerho.candidati.len(), 3);
    }

    #[test]
    fn filtra_similarity_bassa() {
        let prodotti = vec!["test".into()];
        let matches = vec![SupabaseMatch {
            query_index: 0,
            id: "x".into(),
            product_name: "Altro".into(),
            final_price: 5.0,
            ecommerce_id: "e1".into(),
            similarity: 0.05,
            original_url: None,
            discount: None,
        }];

        let result = elabora_confronto(
            prodotti,
            matches,
            sample_catalogo(),
            Some(ElaboraConfig {
                min_similarity: 0.15,
            }),
        );

        assert!(result.tabelle_ecommerce.is_empty());
        assert_eq!(result.scenario_risparmio.copertura, 0);
    }

    #[test]
    fn applica_spedizione_a_scaglioni() {
        let catalogo = vec![EcommerceInfo {
            id: "e1".into(),
            name: "Dentaltix".into(),
            logo_url: None,
            domain: None,
            shipping_tiers: vec![
                ShippingTier {
                    min_value: 0.0,
                    max_value: Some(149.99),
                    shipping_cost: 9.95,
                },
                ShippingTier {
                    min_value: 150.0,
                    max_value: None,
                    shipping_cost: 0.0,
                },
            ],
        }];

        let prodotti = vec!["guanti".into()];
        let matches = vec![SupabaseMatch {
            query_index: 0,
            id: "a".into(),
            product_name: "Guanti".into(),
            final_price: 100.0,
            ecommerce_id: "e1".into(),
            similarity: 0.8,
            original_url: None,
            discount: None,
        }];

        let result = elabora_confronto(prodotti, matches, catalogo, None);

        assert_eq!(result.tabelle_ecommerce[0].prezzo_spedizione, 9.95);
        assert_eq!(result.tabelle_ecommerce[0].prezzo_totale, 109.95);
        assert_eq!(result.scenario_risparmio.prezzo_spedizione, 9.95);
    }
}
