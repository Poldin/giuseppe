import {
  countPubProductsForSitemap,
  fetchPubSitemapEntries,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

export async function generateSitemaps() {
  const total = await countPubProductsForSitemap();
  const chunks = Math.max(1, Math.ceil(total / PUB_SITEMAP_CHUNK_SIZE));
  return Array.from({ length: chunks }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<number | string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  if (!Number.isFinite(id) || id < 0) {
    return [];
  }

  const entries: MetadataRoute.Sitemap = [];

  if (id === 0) {
    entries.push({
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    });
  }

  const offset = id * PUB_SITEMAP_CHUNK_SIZE;
  const products = await fetchPubSitemapEntries(offset, PUB_SITEMAP_CHUNK_SIZE);

  for (const product of products) {
    entries.push({
      url: `${SITE_URL}/pub/${product.pub_slug}`,
      lastModified: product.lastModified,
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return entries;
}
