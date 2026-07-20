import { supabase } from "@/app/lib/SupabaseClient";
import { cache } from "react";

const SUPABASE_PAGE_SIZE = 1000;
/** URLs per sitemap file (under Google's 50k limit). */
export const PUB_SITEMAP_CHUNK_SIZE = 10_000;

export type PubProductEcommerce = {
  id: string;
  name: string;
  logo_url: string | null;
  domain: string | null;
};

export type PubProduct = {
  id: string;
  pub_slug: string;
  product_name: string;
  brand: string | null;
  final_price: number | null;
  discount: number | null;
  description: string | null;
  original_url: string | null;
  update_at: string | null;
  /** DB column typo: `is_escluded`. */
  is_escluded: boolean;
  ecommerce: PubProductEcommerce | null;
};

export type PubSitemapEntry = {
  pub_slug: string;
  lastModified: Date | undefined;
};

function parseOriginalUrl(other: unknown): string | null {
  if (!other || typeof other !== "object") return null;
  const url = (other as { original_url?: unknown }).original_url;
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDiscount(raw: unknown): number | null {
  if (raw == null || Number.isNaN(Number(raw))) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

function parseBrand(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseEcommerce(raw: unknown): PubProductEcommerce | null {
  if (Array.isArray(raw)) {
    return parseEcommerce(raw[0] ?? null);
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    name?: unknown;
    logo_url?: unknown;
    domain?: unknown;
  };
  if (row.id == null) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? "E-commerce"),
    logo_url: row.logo_url ? String(row.logo_url) : null,
    domain: row.domain ? String(row.domain) : null,
  };
}

/** Dedup metadata + page nello stesso request. */
export const fetchPubProductBySlug = cache(
  async (slug: string): Promise<PubProduct | null> => {
    const trimmed = slug.trim();
    if (!trimmed) return null;

    // Include excluded products: page still renders, UI hides price.
    const { data, error } = await supabase
      .from("scraped_product")
      .select(
        `
      id,
      pub_slug,
      product_name,
      brand,
      final_price,
      discount,
      description,
      other,
      update_at,
      is_escluded,
      ecommerce_brand (
        id,
        name,
        logo_url,
        domain
      )
    `
      )
      .eq("pub_slug", trimmed)
      .not("pub_slug", "is", null)
      .maybeSingle();

    if (error) {
      throw new Error(`Lettura prodotto pubblico: ${error.message}`);
    }
    if (!data?.pub_slug) return null;

    const isExcluded = data.is_escluded === true;
    const priceRaw = data.final_price;
    const finalPrice =
      isExcluded || priceRaw == null || Number.isNaN(Number(priceRaw))
        ? null
        : Number(priceRaw);

    return {
      id: String(data.id),
      pub_slug: String(data.pub_slug),
      product_name: String(data.product_name ?? "Prodotto"),
      brand: parseBrand(data.brand),
      final_price: finalPrice,
      discount: isExcluded ? null : parseDiscount(data.discount),
      description:
        typeof data.description === "string" && data.description.trim()
          ? data.description.trim()
          : null,
      original_url: parseOriginalUrl(data.other),
      update_at: data.update_at ? String(data.update_at) : null,
      is_escluded: isExcluded,
      ecommerce: parseEcommerce(data.ecommerce_brand),
    };
  }
);

export async function countPubProductsForSitemap(): Promise<number> {
  const { count, error } = await supabase
    .from("scraped_product")
    .select("id", { count: "exact", head: true })
    .not("pub_slug", "is", null)
    .or("is_escluded.is.null,is_escluded.eq.false");

  if (error) {
    throw new Error(`Conteggio prodotti sitemap: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Stable window of public slugs for sitemap chunking.
 * Paginates in 1000-row batches (Supabase default max).
 */
export async function fetchPubSitemapEntries(
  offset: number,
  limit: number
): Promise<PubSitemapEntry[]> {
  if (limit <= 0) return [];

  const entries: PubSitemapEntry[] = [];
  let from = offset;
  const endExclusive = offset + limit;

  while (from < endExclusive) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, endExclusive - 1);
    const { data, error } = await supabase
      .from("scraped_product")
      .select("pub_slug, update_at")
      .not("pub_slug", "is", null)
      .or("is_escluded.is.null,is_escluded.eq.false")
      .order("pub_slug", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Lettura slug sitemap: ${error.message}`);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.pub_slug) continue;
      entries.push({
        pub_slug: String(row.pub_slug),
        lastModified: row.update_at ? new Date(String(row.update_at)) : undefined,
      });
    }

    if (rows.length < to - from + 1) break;
    from = to + 1;
  }

  return entries;
}

export function formatPubPrice(price: number | null): string | null {
  if (price == null || Number.isNaN(price)) return null;
  return price.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Title SEO / browser: nome + prezzo + ecommerce.
 * Es. "Guanti nitrile M — 12,90 € su Gerhò"
 * (il layout aggiunge " | Giuseppe")
 */
export function pubProductDisplayTitle(product: PubProduct): string {
  const shop = product.ecommerce?.name?.trim() || null;
  const price = !product.is_escluded
    ? formatPubPrice(product.final_price)
    : null;

  if (price && shop) return `${product.product_name} — ${price} su ${shop}`;
  if (price) return `${product.product_name} — ${price}`;
  if (shop) return `${product.product_name} su ${shop}`;
  return product.product_name;
}
