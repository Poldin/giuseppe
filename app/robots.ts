import {
  countPubProductsForSitemap,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const total = await countPubProductsForSitemap();
  const chunks = Math.max(1, Math.ceil(total / PUB_SITEMAP_CHUNK_SIZE));
  const sitemaps = Array.from(
    { length: chunks },
    (_, id) => `${SITE_URL}/sitemap/${id}.xml`
  );

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/chat/", "/warehouse/", "/api/"],
    },
    sitemap: sitemaps,
    host: SITE_URL,
  };
}
