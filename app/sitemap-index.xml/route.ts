import {
  countDocsForSitemap,
} from "@/app/lib/docs/document";
import {
  countMedicalDevicesForSitemap,
} from "@/app/lib/medical-device/device";
import {
  countPubProductsForSitemap,
  MAX_SITEMAP_CHUNKS,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import { countRecallsForSitemap } from "@/app/lib/recall/recall";
import { countVsCombinationsForSitemap } from "@/app/lib/vs/combination";
import { SITE_URL } from "@/app/lib/seo/site";

/**
 * Indice sitemap per GSC / crawler.
 * Con `generateSitemaps` Next espone i chunk `/sitemap/{id}.xml` ma (in questa
 * versione) non genera `/sitemap.xml` — lo serviamo qui + rewrite in next.config.
 *
 * I count sono isolati + retry: un fallimento su una sola fonte non azzera
 * l’intero indice (bug precedente → Google vedeva solo chunk 0).
 */
export const dynamic = "force-dynamic";

const COUNT_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeCount(
  label: string,
  fn: () => Promise<number>
): Promise<number> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= COUNT_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(
        `[sitemap-index] count ${label} failed (attempt ${attempt}/${COUNT_ATTEMPTS}):`,
        error
      );
      if (attempt < COUNT_ATTEMPTS) {
        await sleep(150 * attempt);
      }
    }
  }
  console.error(`[sitemap-index] count ${label} gave up:`, lastError);
  return 0;
}

function chunkCountForTotal(total: number): number {
  if (total <= 0) {
    // Count falliti o catalogo vuoto: annuncia tutti i chunk noti a build.
    // I chunk oltre il reale restituiscono urlset vuoto — meglio di nascondere URL.
    return MAX_SITEMAP_CHUNKS;
  }
  return Math.min(
    MAX_SITEMAP_CHUNKS,
    Math.max(1, Math.ceil(total / PUB_SITEMAP_CHUNK_SIZE))
  );
}

export async function GET() {
  // Sequenziale: i count exact su tabelle grandi in parallelo fallivano
  // in modo intermittente e, col vecchio Promise.all, azzeravano l’indice.
  const pubTotal = await safeCount("pub", countPubProductsForSitemap);
  const vsTotal = await safeCount("vs", countVsCombinationsForSitemap);
  const recallTotal = await safeCount("recall", countRecallsForSitemap);
  const deviceTotal = await safeCount(
    "medical_device",
    countMedicalDevicesForSitemap
  );
  const docsTotal = await safeCount("docs", countDocsForSitemap);

  const total = pubTotal + vsTotal + recallTotal + deviceTotal + docsTotal;
  const chunks = chunkCountForTotal(total);

  console.info("[sitemap-index] totals", {
    pubTotal,
    vsTotal,
    recallTotal,
    deviceTotal,
    docsTotal,
    total,
    chunks,
  });

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
      // Cache corta: dopo un deploy GSC/CDN vedono l’indice corretto in fretta
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
