export type ShippingTier = {
  min_value: number;
  max_value: number | null;
  shipping_cost: number;
};

export function parseShippingTiers(other: unknown): ShippingTier[] {
  if (!other || typeof other !== "object") {
    return [];
  }

  const tiers = (other as { tiers?: unknown }).tiers;
  if (!Array.isArray(tiers)) {
    return [];
  }

  const parsed: ShippingTier[] = [];

  for (const raw of tiers) {
    if (!raw || typeof raw !== "object") continue;

    const tier = raw as {
      min_value?: unknown;
      max_value?: unknown;
      shipping_cost?: unknown;
    };

    const min_value = Number(tier.min_value);
    const shipping_cost = Number(tier.shipping_cost);

    if (Number.isNaN(min_value) || Number.isNaN(shipping_cost)) {
      continue;
    }

    const maxRaw = tier.max_value;
    const max_value =
      maxRaw == null || maxRaw === ""
        ? null
        : Number.isNaN(Number(maxRaw))
          ? null
          : Number(maxRaw);

    parsed.push({ min_value, max_value, shipping_cost });
  }

  return parsed;
}

export function calcolaSpedizione(
  prezzoProdotti: number,
  tiers: ShippingTier[]
): number {
  if (prezzoProdotti <= 0 || tiers.length === 0) {
    return 0;
  }

  for (const tier of tiers) {
    const minOk = prezzoProdotti >= tier.min_value;
    const maxOk =
      tier.max_value == null || prezzoProdotti <= tier.max_value;

    if (minOk && maxOk) {
      return tier.shipping_cost;
    }
  }

  return 0;
}

export function deltaSpedizione(
  subtotalePrima: number,
  subtotaleDopo: number,
  tiers: ShippingTier[]
): number {
  return (
    calcolaSpedizione(subtotaleDopo, tiers) -
    calcolaSpedizione(subtotalePrima, tiers)
  );
}

export function spedizioneOrdini(
  ordini: Record<string, { prezzo_riga: number }[]>,
  tiersByEcommerce: Record<string, ShippingTier[]>
): number {
  return Object.entries(ordini).reduce((sum, [ecomId, voci]) => {
    const subtotale = voci.reduce((acc, voce) => acc + voce.prezzo_riga, 0);
    return sum + calcolaSpedizione(subtotale, tiersByEcommerce[ecomId] ?? []);
  }, 0);
}

export function buildShippingTiersMap(
  catalogo: Array<{ id: string; shipping_tiers?: ShippingTier[] }>
): Record<string, ShippingTier[]> {
  return Object.fromEntries(
    catalogo.map((ecom) => [ecom.id, ecom.shipping_tiers ?? []])
  );
}

export type ShippingHint = {
  gap: number;
  targetShipping: number;
};

export function buildShippingHints(
  prezzoProdotti: number,
  tiers: ShippingTier[]
): ShippingHint[] {
  if (prezzoProdotti <= 0 || tiers.length === 0) {
    return [];
  }

  const currentShipping = calcolaSpedizione(prezzoProdotti, tiers);
  const bestByTarget = new Map<number, number>();

  for (const tier of tiers) {
    if (tier.min_value <= prezzoProdotti) {
      continue;
    }

    const gap = tier.min_value - prezzoProdotti;
    const targetShipping = calcolaSpedizione(tier.min_value, tiers);

    if (targetShipping >= currentShipping) {
      continue;
    }

    const existing = bestByTarget.get(targetShipping);
    if (existing == null || gap < existing) {
      bestByTarget.set(targetShipping, gap);
    }
  }

  return [...bestByTarget.entries()]
    .map(([targetShipping, gap]) => ({ gap, targetShipping }))
    .sort((a, b) => a.gap - b.gap);
}
