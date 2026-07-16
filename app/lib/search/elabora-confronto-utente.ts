import type {

  EcommerceInfo,

  ProdottoOfferta,

  RisultatoCalcoloUtente,

  SelezioneUtente,

  VoceOrdine,

} from "@/app/lib/search/elabora-scenari-types";

import {

  buildShippingTiersMap,

  calcolaSpedizione,

  deltaSpedizione,

  spedizioneOrdini,

  type ShippingTier,

} from "@/app/lib/search/shipping-cost";



type MatriceUtente = Map<number, Map<string, VoceOrdine>>;



function prezzoRiga(offerta: ProdottoOfferta, quantita: number): number {

  return offerta.prezzo * quantita;

}



function voceOrdine(

  offerta: ProdottoOfferta,

  quantita: number,

  disponibile: boolean

): VoceOrdine {

  return {

    offerta,

    quantita,

    prezzo_riga: prezzoRiga(offerta, quantita),

    disponibile,

  };

}



export function buildMatriceFromSelezione(
  selezioni: SelezioneUtente[]
): MatriceUtente {

  const matrice: MatriceUtente = new Map();



  for (const sel of selezioni) {

    if (sel.quantita <= 0) continue;



    const quantita = Math.max(1, sel.quantita);

    const ecomMap = matrice.get(sel.query_index) ?? new Map();

    ecomMap.set(

      sel.ecommerce_id,

      voceOrdine(sel.offerta, quantita, sel.disponibile)

    );

    matrice.set(sel.query_index, ecomMap);

  }



  return matrice;

}



function ecommerceIdsInMatrice(matrice: MatriceUtente): string[] {

  const ids = new Set<string>();

  for (const ecomMap of matrice.values()) {

    for (const ecomId of ecomMap.keys()) {

      ids.add(ecomId);

    }

  }

  return [...ids].sort();

}



function lookupEcommerce(

  ecomId: string,

  catalogo: EcommerceInfo[]

): EcommerceInfo {

  return (

    catalogo.find((e) => e.id === ecomId) ?? {

      id: ecomId,

      name: ecomId,

      logo_url: null,

      domain: null,

      shipping_tiers: [],

    }

  );

}



function lookupTiers(

  ecomId: string,

  tiersByEcommerce: Record<string, ShippingTier[]>

): ShippingTier[] {

  return tiersByEcommerce[ecomId] ?? [];

}



export function elaboraConfrontoUtente(input: {

  prodottiRichiesti: string[];

  selezioni: SelezioneUtente[];

  catalogoEcommerce: EcommerceInfo[];

}): RisultatoCalcoloUtente {

  const tiersByEcommerce = buildShippingTiersMap(input.catalogoEcommerce);

  const n = input.prodottiRichiesti.length;

  const matrice = buildMatriceFromSelezione(input.selezioni);



  const tabelle_ecommerce = ecommerceIdsInMatrice(matrice).map((ecomId) => {

    const info = lookupEcommerce(ecomId, input.catalogoEcommerce);

    let prezzo_prodotti = 0;

    let copertura = 0;



    const righe = input.prodottiRichiesti.map((queryText, idx) => {

      const queryIndex = idx;

      const voce = matrice.get(queryIndex)?.get(ecomId) ?? null;



      if (voce?.disponibile) {

        copertura += 1;

        prezzo_prodotti += voce.prezzo_riga;

      }



      return {

        query_index: queryIndex,

        query_text: queryText,

        trovato: Boolean(voce),

        offerta: voce?.offerta ?? null,

        quantita: voce?.quantita,

        prezzo_riga: voce?.prezzo_riga,

        disponibile: voce?.disponibile,

      };

    });



    const prezzo_spedizione =

      copertura > 0

        ? calcolaSpedizione(prezzo_prodotti, lookupTiers(ecomId, tiersByEcommerce))

        : 0;



    return {

      ecommerce_id: ecomId,

      ecommerce_name: info.name,

      logo_url: info.logo_url,

      domain: info.domain,

      prezzo_prodotti,

      prezzo_spedizione,

      prezzo_totale: prezzo_prodotti + prezzo_spedizione,

      copertura,

      copertura_totale: n,

      righe,

    };

  });



  tabelle_ecommerce.sort((a, b) => {

    if (b.copertura !== a.copertura) return b.copertura - a.copertura;

    return a.prezzo_totale - b.prezzo_totale;

  });



  const scenario_risparmio = (() => {

    const ordini: Record<string, VoceOrdine[]> = {};

    const subtotals: Record<string, number> = {};

    let prezzo_prodotti = 0;

    let copertura = 0;

    const mancanti: number[] = [];



    for (let idx = 0; idx < n; idx += 1) {

      const offerte = matrice.get(idx);

      if (!offerte) {

        mancanti.push(idx);

        continue;

      }



      let migliore: { ecomId: string; voce: VoceOrdine } | null = null;

      let migliorCosto = Number.POSITIVE_INFINITY;



      for (const [ecomId, voce] of offerte.entries()) {

        if (!voce.disponibile) continue;



        const subtotalePrima = subtotals[ecomId] ?? 0;

        const subtotaleDopo = subtotalePrima + voce.prezzo_riga;

        const tiers = lookupTiers(ecomId, tiersByEcommerce);

        const costoMarginal =

          voce.prezzo_riga +

          deltaSpedizione(subtotalePrima, subtotaleDopo, tiers);



        if (costoMarginal < migliorCosto) {

          migliorCosto = costoMarginal;

          migliore = { ecomId, voce };

        }

      }



      if (migliore) {

        ordini[migliore.ecomId] = [

          ...(ordini[migliore.ecomId] ?? []),

          migliore.voce,

        ];

        subtotals[migliore.ecomId] =

          (subtotals[migliore.ecomId] ?? 0) + migliore.voce.prezzo_riga;

        prezzo_prodotti += migliore.voce.prezzo_riga;

        copertura += 1;

      } else {

        mancanti.push(idx);

      }

    }



    const prezzo_spedizione = spedizioneOrdini(ordini, tiersByEcommerce);



    return {

      titolo: "💸Miglior soluzione",

      prezzo_prodotti,

      prezzo_spedizione,

      prezzo_totale: prezzo_prodotti + prezzo_spedizione,

      copertura,

      copertura_totale: n,

      ordini,

      prodotti_mancanti_indices: mancanti,

    };

  })();



  const scenario_monopolista = (() => {

    const ecommerceIds = ecommerceIdsInMatrice(matrice);

    let migliorEcom = "";

    let maxCopertura = 0;

    let minorPrezzo = Number.POSITIVE_INFINITY;

    let migliorOrdini: Record<string, VoceOrdine[]> = {};



    for (const ecomId of ecommerceIds) {

      let copertura = 0;

      let prezzoProdotti = 0;

      const prodotti: VoceOrdine[] = [];



      for (let idx = 0; idx < n; idx += 1) {

        const voce = matrice.get(idx)?.get(ecomId);

        if (!voce?.disponibile) continue;

        copertura += 1;

        prezzoProdotti += voce.prezzo_riga;

        prodotti.push(voce);

      }



      const prezzoSpedizione =

        copertura > 0

          ? calcolaSpedizione(

              prezzoProdotti,

              lookupTiers(ecomId, tiersByEcommerce)

            )

          : 0;

      const prezzoTotale = prezzoProdotti + prezzoSpedizione;



      if (

        copertura > maxCopertura ||

        (copertura === maxCopertura && prezzoTotale < minorPrezzo)

      ) {

        maxCopertura = copertura;

        minorPrezzo = prezzoTotale;

        migliorEcom = ecomId;

        migliorOrdini = prodotti.length > 0 ? { [ecomId]: prodotti } : {};

      }

    }



    const mancanti: number[] = [];

    for (let idx = 0; idx < n; idx += 1) {

      const voce = matrice.get(idx)?.get(migliorEcom);

      if (!voce?.disponibile) mancanti.push(idx);

    }



    const prezzo_prodotti = Object.values(migliorOrdini)

      .flat()

      .reduce((sum, voce) => sum + voce.prezzo_riga, 0);

    const prezzo_spedizione = spedizioneOrdini(migliorOrdini, tiersByEcommerce);



    return {

      titolo: "💎Massima comodità",

      prezzo_prodotti,

      prezzo_spedizione,

      prezzo_totale:

        minorPrezzo === Number.POSITIVE_INFINITY

          ? 0

          : prezzo_prodotti + prezzo_spedizione,

      copertura: maxCopertura,

      copertura_totale: n,

      ordini: migliorOrdini,

      prodotti_mancanti_indices: mancanti,

    };

  })();



  return {

    tabelle_ecommerce,

    scenario_risparmio,

    scenario_monopolista,

  };

}



export function buildSelezioneUtente(input: {

  cardKey: string;

  queryIndex: number;

  ecommerceId: string;

  offerta: ProdottoOfferta;

  quantita: number;

  selezionato: boolean;

  disponibile?: boolean;

}): SelezioneUtente | null {

  if (!input.selezionato) return null;



  return {

    query_index: input.queryIndex,

    ecommerce_id: input.ecommerceId,

    offerta: input.offerta,

    quantita: Math.max(1, input.quantita),

    disponibile: input.disponibile ?? true,

  };

}



export function collectWinningOfferIds(

  calcolo: RisultatoCalcoloUtente

): Set<string> {

  const ids = new Set<string>();



  for (const scenario of [

    calcolo.scenario_risparmio,

    calcolo.scenario_monopolista,

  ]) {

    for (const voci of Object.values(scenario.ordini)) {

      for (const voce of voci) {

        ids.add(voce.offerta.id);

      }

    }

  }



  return ids;

}


