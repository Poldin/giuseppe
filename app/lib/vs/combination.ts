import {
  calcolaSpedizione,
  parseShippingTiers,
  type ShippingTier,
} from "@/app/lib/search/shipping-cost";
import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;
export const VS_SITEMAP_CHUNK_SIZE = 10_000;

export type VsShop = {
  id: string;
  name: string;
  logo_url: string | null;
  domain: string | null;
  shipping_tiers: ShippingTier[];
};

export type VsSide = {
  id: string;
  product_name: string;
  brand: string | null;
  final_price: number | null;
  pub_slug: string | null;
  original_url: string | null;
  is_escluded: boolean;
  ecommerce: VsShop;
  shipping_cost: number | null;
  total_price: number | null;
  /** 1 = più conveniente, 2 = secondo, null = pari / n/d */
  rank: 1 | 2 | null;
};

export type VsCombination = {
  id: string;
  slug: string;
  title: string;
  canonical_name: string;
  score: number;
  created_at: string | null;
  side_a: VsSide;
  side_b: VsSide;
  /** Differenza assoluta tra i due prezzi prodotto (null se non calcolabile). */
  price_diff: number | null;
  /** Shop col prezzo prodotto più basso (null se pari / n/d). */
  cheaper_shop_name: string | null;
};

export type VsSitemapEntry = {
  slug: string;
  lastModified: Date | undefined;
};

type OtherProduct = {
  id?: unknown;
  product_name?: unknown;
  brand?: unknown;
  ecommerce_id?: unknown;
  ecommerce_name?: unknown;
  final_price?: unknown;
  pub_slug?: unknown;
};

type CombinationOther = {
  score?: unknown;
  title?: unknown;
  canonical_name?: unknown;
  product_a?: OtherProduct;
  product_b?: OtherProduct;
};

function asString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(raw: unknown): number | null {
  if (raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function parseOriginalUrl(other: unknown): string | null {
  if (!other || typeof other !== "object") return null;
  return asString((other as { original_url?: unknown }).original_url);
}

function parseShopFromBrand(raw: unknown): VsShop | null {
  if (Array.isArray(raw)) return parseShopFromBrand(raw[0] ?? null);
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    name?: unknown;
    logo_url?: unknown;
    domain?: unknown;
    other?: unknown;
  };
  if (row.id == null) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? "E-commerce"),
    logo_url: row.logo_url ? String(row.logo_url) : null,
    domain: row.domain ? String(row.domain) : null,
    shipping_tiers: parseShippingTiers(row.other),
  };
}

function fallbackShop(fromOther: OtherProduct | undefined): VsShop {
  return {
    id: asString(fromOther?.ecommerce_id) ?? "unknown",
    name: asString(fromOther?.ecommerce_name) ?? "E-commerce",
    logo_url: null,
    domain: null,
    shipping_tiers: [],
  };
}

function buildSide(args: {
  fromOther: OtherProduct | undefined;
  live:
    | {
        id: string;
        product_name: string | null;
        brand: string | null;
        final_price: number | null;
        pub_slug: string | null;
        other: unknown;
        is_escluded: boolean | null;
        ecommerce_brand: unknown;
      }
    | null;
}): Omit<VsSide, "rank"> {
  const live = args.live;
  const fromOther = args.fromOther;
  const isExcluded = live?.is_escluded === true;
  const shop =
    parseShopFromBrand(live?.ecommerce_brand) ?? fallbackShop(fromOther);

  const priceRaw = live?.final_price ?? asNumber(fromOther?.final_price);
  const finalPrice =
    isExcluded || priceRaw == null || Number.isNaN(priceRaw)
      ? null
      : priceRaw;

  let shippingCost: number | null = null;
  let totalPrice: number | null = null;
  if (finalPrice != null && shop.shipping_tiers.length > 0) {
    shippingCost = calcolaSpedizione(finalPrice, shop.shipping_tiers);
    totalPrice = finalPrice + shippingCost;
  } else if (finalPrice != null) {
    totalPrice = finalPrice;
  }

  return {
    id: live?.id ?? asString(fromOther?.id) ?? "",
    product_name:
      asString(live?.product_name) ??
      asString(fromOther?.product_name) ??
      "Prodotto",
    brand: asString(live?.brand) ?? asString(fromOther?.brand),
    final_price: finalPrice,
    pub_slug: asString(live?.pub_slug) ?? asString(fromOther?.pub_slug),
    original_url: parseOriginalUrl(live?.other),
    is_escluded: isExcluded,
    ecommerce: shop,
    shipping_cost: shippingCost,
    total_price: totalPrice,
  };
}

function assignRanks(
  a: Omit<VsSide, "rank">,
  b: Omit<VsSide, "rank">
): { side_a: VsSide; side_b: VsSide; price_diff: number | null; cheaper_shop_name: string | null } {
  const pa = a.is_escluded ? null : a.final_price;
  const pb = b.is_escluded ? null : b.final_price;

  if (pa == null || pb == null) {
    return {
      side_a: { ...a, rank: null },
      side_b: { ...b, rank: null },
      price_diff: null,
      cheaper_shop_name: null,
    };
  }

  const diff = Math.abs(pa - pb);
  if (pa < pb) {
    return {
      side_a: { ...a, rank: 1 },
      side_b: { ...b, rank: 2 },
      price_diff: diff,
      cheaper_shop_name: a.ecommerce.name,
    };
  }
  if (pb < pa) {
    return {
      side_a: { ...a, rank: 2 },
      side_b: { ...b, rank: 1 },
      price_diff: diff,
      cheaper_shop_name: b.ecommerce.name,
    };
  }
  return {
    side_a: { ...a, rank: null },
    side_b: { ...b, rank: null },
    price_diff: 0,
    cheaper_shop_name: null,
  };
}

/** Dedup metadata + page nello stesso request. */
export const fetchVsCombinationBySlug = cache(
  async (slug: string): Promise<VsCombination | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("product_combinations")
      .select("id, slug, other, created_at")
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura combination: ${error.message}`);
    }
    if (!data?.slug) return null;

    const other = (data.other ?? {}) as CombinationOther;
    const productAId = asString(other.product_a?.id);
    const productBId = asString(other.product_b?.id);
    const ids = [productAId, productBId].filter(
      (id): id is string => Boolean(id)
    );

    type LiveRow = {
      id: string;
      product_name: string | null;
      brand: string | null;
      final_price: number | null;
      pub_slug: string | null;
      other: unknown;
      is_escluded: boolean | null;
      ecommerce_brand: unknown;
    };

    const liveById = new Map<string, LiveRow>();
    if (ids.length > 0) {
      const { data: liveRows, error: liveError } = await supabase
        .from("scraped_product")
        .select(
          `
          id,
          product_name,
          brand,
          final_price,
          pub_slug,
          other,
          is_escluded,
          ecommerce_brand (
            id,
            name,
            logo_url,
            domain,
            other
          )
        `
        )
        .in("id", ids);

      if (liveError) {
        throw new Error(`Lettura prodotti combination: ${liveError.message}`);
      }

      for (const row of liveRows ?? []) {
        liveById.set(String(row.id), {
          id: String(row.id),
          product_name: row.product_name,
          brand: row.brand,
          final_price:
            row.final_price == null || Number.isNaN(Number(row.final_price))
              ? null
              : Number(row.final_price),
          pub_slug: row.pub_slug,
          other: row.other,
          is_escluded: row.is_escluded,
          ecommerce_brand: row.ecommerce_brand,
        });
      }
    }

    const sideABase = buildSide({
      fromOther: other.product_a,
      live: productAId ? liveById.get(productAId) ?? null : null,
    });
    const sideBBase = buildSide({
      fromOther: other.product_b,
      live: productBId ? liveById.get(productBId) ?? null : null,
    });

    const ranked = assignRanks(sideABase, sideBBase);
    const title =
      asString(other.title) ??
      `${asString(other.canonical_name) ?? "Prodotto"} — confronto prezzi`;
    const canonical =
      asString(other.canonical_name) ??
      ranked.side_a.product_name;
    const score = asNumber(other.score) ?? 0;

    return {
      id: String(data.id),
      slug: String(data.slug),
      title,
      canonical_name: canonical,
      score,
      created_at: data.created_at ? String(data.created_at) : null,
      side_a: ranked.side_a,
      side_b: ranked.side_b,
      price_diff: ranked.price_diff,
      cheaper_shop_name: ranked.cheaper_shop_name,
    };
  }
);

export async function countVsCombinationsForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("product_combinations")
    .select("id", { count: "exact", head: true })
    .not("slug", "is", null);

  if (error) {
    const detail = [error.message, error.code, error.details, error.hint]
      .filter(Boolean)
      .join(" | ");
    throw new Error(
      `Conteggio combination sitemap: ${detail || "errore sconosciuto"}`
    );
  }

  return count ?? 0;
}

export async function fetchVsSitemapEntries(
  offset: number,
  limit: number
): Promise<VsSitemapEntry[]> {
  if (limit <= 0) return [];

  const entries: VsSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    const { data, error } = await supabase
      .from("product_combinations")
      .select("slug, created_at")
      .not("slug", "is", null)
      .order("slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Lettura slug combination sitemap: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.slug) continue;
      entries.push({
        slug: String(row.slug),
        lastModified: row.created_at
          ? new Date(String(row.created_at))
          : undefined,
      });
    }

    if (rows.length < to - from + 1) break;
    from = to + 1;
  }

  return entries;
}

export function formatVsPrice(price: number | null): string | null {
  if (price == null || Number.isNaN(price)) return null;
  return price.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function vsCombinationDisplayTitle(combo: VsCombination): string {
  const diff = formatVsPrice(combo.price_diff);
  if (diff && combo.cheaper_shop_name && (combo.price_diff ?? 0) > 0) {
    return `${combo.canonical_name} — risparmi ${diff} su ${combo.cheaper_shop_name}`;
  }
  return combo.title;
}
