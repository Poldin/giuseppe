import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

/**
 * SEO pubbliche indicizzate via /sitemap.xml:
 * /pub/*, /recall/*, /medical_device/*
 * (allow "/" le include; chat/warehouse/api restano fuori)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/chat/", "/warehouse/", "/api/"],
    },
    // Indice unico; i chunk `/sitemap/{id}.xml` sono referenziati da lì.
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
