import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

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
