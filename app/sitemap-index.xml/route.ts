import {
  countMedicalDevicesForSitemap,
} from "@/app/lib/medical-device/device";
import {
  countPubProductsForSitemap,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import { countRecallsForSitemap } from "@/app/lib/recall/recall";
import { SITE_URL } from "@/app/lib/seo/site";

/**
 * Indice sitemap per GSC / crawler.
 * Con `generateSitemaps` Next espone i chunk `/sitemap/{id}.xml` ma (in questa
 * versione) non genera `/sitemap.xml` — lo serviamo qui + rewrite in next.config.
 */
export async function GET() {
  const [pubTotal, recallTotal, deviceTotal] = await Promise.all([
    countPubProductsForSitemap(),
    countRecallsForSitemap(),
    countMedicalDevicesForSitemap(),
  ]);
  const total = pubTotal + recallTotal + deviceTotal;
  const chunks = Math.max(1, Math.ceil(total / PUB_SITEMAP_CHUNK_SIZE));

  const entries = Array.from({ length: chunks }, (_, id) => {
    return `  <sitemap>
    <loc>${SITE_URL}/sitemap/${id}.xml</loc>
  </sitemap>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Indice leggero: totali pub+recall+medical_device; cache edge 1h
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
