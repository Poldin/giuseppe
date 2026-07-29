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
  /** 1 = più conveniente, poi 2…; null = n/d */
  rank: number | null;
};

export type VsCombinationKind = "cluster" | "pair";

export type VsCombination = {
  id: string;
  slug: string;
  title: string;
  canonical_name: string;
  score: number;
  created_at: string | null;
  kind: VsCombinationKind;
  /** Su pagine pair: slug del cluster (canonical SEO). */
  cluster_slug: string | null;
  sides: VsSide[];
  /** Differenza max−min tra prezzi disponibili (null se <2 prezzi). */
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
  kind?: unknown;
  score?: unknown;
  title?: unknown;
  canonical_name?: unknown;
  cluster_slug?: unknown;
  /** Target 301 da vecchie 1v1 (o combo inactive) verso cluster attivo. */
  redirect_to?: unknown;
  products?: unknown;
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

function parseOtherProducts(other: CombinationOther): OtherProduct[] {
  if (Array.isArray(other.products)) {
    return other.products.filter(
      (p): p is OtherProduct => Boolean(p) && typeof p === "object"
    );
  }
  const legacy = [other.product_a, other.product_b].filter(
    (p): p is OtherProduct => Boolean(p) && typeof p === "object"
  );
  return legacy;
}

function parseKind(
  other: CombinationOther,
  productCount: number
): VsCombinationKind {
  const raw = asString(other.kind);
  if (raw === "cluster" || raw === "pair") return raw;
  return productCount > 2 ? "cluster" : "pair";
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

function assignRanks(sidesIn: Omit<VsSide, "rank">[]): {
  sides: VsSide[];
  price_diff: number | null;
  cheaper_shop_name: string | null;
} {
  const priced = sidesIn
    .map((side, index) => ({ side, index }))
    .filter(
      ({ side }) =>
        !side.is_escluded && side.final_price != null && !Number.isNaN(side.final_price)
    )
    .sort((a, b) => (a.side.final_price as number) - (b.side.final_price as number));

  const rankByIndex = new Map<number, number>();
  priced.forEach((entry, i) => {
    rankByIndex.set(entry.index, i + 1);
  });

  const sides: VsSide[] = sidesIn.map((side, index) => ({
    ...side,
    rank: rankByIndex.get(index) ?? null,
  }));

  if (priced.length < 2) {
    return {
      sides,
      price_diff: null,
      cheaper_shop_name: priced[0]?.side.ecommerce.name ?? null,
    };
  }

  const min = priced[0].side.final_price as number;
  const max = priced[priced.length - 1].side.final_price as number;
  const cheaper = priced[0].side.ecommerce.name;
  const allSame = max - min < 1e-9;

  return {
    sides,
    price_diff: allSame ? 0 : max - min,
    cheaper_shop_name: allSame ? null : cheaper,
  };
}

/** Dedup metadata + page nello stesso request. */
export const fetchVsCombinationBySlug = cache(
  async (slug: string): Promise<VsCombination | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("product_combinations")
      .select("id, slug, other, created_at, is_active")
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura combination: ${error.message}`);
    }
    if (!data?.slug) return null;
    // Solo true: null (legacy) e false → non pubbliche
    if (data.is_active !== true) return null;

    return hydrateVsCombination(data);
  }
);

/**
 * Se lo slug non è più attivo ma ha un redirect_to verso un cluster,
 * restituisce lo slug destinazione (per 301).
 */
export const fetchVsRedirectSlug = cache(
  async (slug: string): Promise<string | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    const { data, error } = await supabase
      .from("product_combinations")
      .select("slug, other, is_active")
      .eq("slug", trimmed)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura redirect combination: ${error.message}`);
    }
    if (!data?.slug) return null;
    if (data.is_active === true) return null;

    const other = (data.other ?? {}) as CombinationOther;
    const target =
      asString(other.redirect_to) ?? asString(other.cluster_slug);
    if (!target || target === trimmed) return null;

    const { data: dest, error: destError } = await supabase
      .from("product_combinations")
      .select("slug, is_active")
      .eq("slug", target)
      .eq("is_active", true)
      .maybeSingle();

    if (destError) {
      throw new Error(`Lettura destinazione redirect: ${destError.message}`);
    }
    return dest?.slug ? String(dest.slug) : null;
  }
);

async function hydrateVsCombination(data: {
  id: unknown;
  slug: unknown;
  other: unknown;
  created_at: unknown;
}): Promise<VsCombination | null> {
    const other = (data.other ?? {}) as CombinationOther;
    const otherProducts = parseOtherProducts(other);
    if (otherProducts.length < 2) return null;

    const ids = otherProducts
      .map((p) => asString(p.id))
      .filter((id): id is string => Boolean(id));

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

    const bases = otherProducts.map((fromOther) => {
      const id = asString(fromOther.id);
      return buildSide({
        fromOther,
        live: id ? liveById.get(id) ?? null : null,
      });
    });

    const ranked = assignRanks(bases);
    const kind = parseKind(other, ranked.sides.length);
    const title =
      asString(other.title) ??
      `${asString(other.canonical_name) ?? "Prodotto"} — confronto prezzi`;
    const canonical =
      asString(other.canonical_name) ?? ranked.sides[0]?.product_name ?? "Prodotto";
    const score = asNumber(other.score) ?? 0;
    const clusterSlug =
      kind === "pair" ? asString(other.cluster_slug) : null;

    return {
      id: String(data.id),
      slug: String(data.slug),
      title,
      canonical_name: canonical,
      score,
      created_at: data.created_at ? String(data.created_at) : null,
      kind,
      cluster_slug: clusterSlug,
      sides: ranked.sides,
      price_diff: ranked.price_diff,
      cheaper_shop_name: ranked.cheaper_shop_name,
    };
}

export async function countVsCombinationsForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("product_combinations")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .not("slug", "is", null)
    .filter("other->>kind", "eq", "cluster");

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
      .eq("is_active", true)
      .not("slug", "is", null)
      .filter("other->>kind", "eq", "cluster")
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

export type VsHubHit = {
  slug: string;
  title: string;
  canonical_name: string;
};

export const VS_HUB_RESULT_LIMIT = 20;

function escapeIlikePattern(query: string): string | null {
  const safe = query
    .trim()
    .replace(/[%_,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return safe.length > 0 ? safe : null;
}

function mapVsHubRow(row: {
  slug?: unknown;
  other?: unknown;
}): VsHubHit | null {
  const slug =
    typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : null;
  if (!slug) return null;
  const other =
    row.other && typeof row.other === "object" && !Array.isArray(row.other)
      ? (row.other as CombinationOther)
      : {};
  const canonical =
    asString(other.canonical_name) || asString(other.title) || slug;
  const title = asString(other.title) || canonical;
  return { slug, title, canonical_name: canonical };
}

/** Ultimi confronti cluster per hub (max 20). */
export async function fetchVsHubSamples(
  limit = VS_HUB_RESULT_LIMIT
): Promise<VsHubHit[]> {
  const { data, error } = await supabase
    .from("product_combinations")
    .select("slug, other, created_at")
    .eq("is_active", true)
    .not("slug", "is", null)
    .filter("other->>kind", "eq", "cluster")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`Campione hub confronti: ${error.message}`);
  }

  const hits: VsHubHit[] = [];
  for (const row of data ?? []) {
    const hit = mapVsHubRow(row);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** Ricerca hub confronti (max 20; solo cluster attivi). */
export async function searchVsCombinations(
  query: string,
  limit = VS_HUB_RESULT_LIMIT
): Promise<VsHubHit[]> {
  const safe = escapeIlikePattern(query);
  if (!safe) return [];
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from("product_combinations")
    .select("slug, other")
    .eq("is_active", true)
    .not("slug", "is", null)
    .filter("other->>kind", "eq", "cluster")
    .or(
      `other->>canonical_name.ilike."${pattern}",other->>title.ilike."${pattern}",slug.ilike."${pattern}"`
    )
    .order("slug", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Ricerca hub confronti: ${error.message}`);
  }

  const hits: VsHubHit[] = [];
  for (const row of data ?? []) {
    const hit = mapVsHubRow(row);
    if (hit) hits.push(hit);
  }
  return hits;
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
    if (combo.kind === "cluster" && combo.sides.length > 2) {
      return `${combo.canonical_name} — da ${formatVsPrice(
        combo.sides.find((s) => s.rank === 1)?.final_price ?? null
      )}, risparmi fino a ${diff}`;
    }
    return `${combo.canonical_name} — risparmi ${diff} su ${combo.cheaper_shop_name}`;
  }
  return combo.title;
}

export function vsShopNamesLabel(combo: VsCombination): string {
  const names = combo.sides.map((s) => s.ecommerce.name);
  if (names.length <= 1) return names[0] ?? "E-commerce";
  if (names.length === 2) return `${names[0]} vs ${names[1]}`;
  return `${names.length} shop a confronto`;
}
