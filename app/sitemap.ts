import {
  fetchMedicalDeviceSitemapEntries,
} from "@/app/lib/medical-device/device";
import {
  countPubProductsForSitemap,
  fetchPubSitemapEntries,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import {
  countRecallsForSitemap,
  fetchRecallSitemapEntries,
} from "@/app/lib/recall/recall";
import { medicalDevicePath } from "@/app/lib/seo/medical-device";
import { recallPath } from "@/app/lib/seo/recall";
import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

/**
 * Non pre-renderizzare i chunk a build-time (evita timeout Supabase su Vercel
 * con ~145k URL: pub + recall + medical_device).
 * L'indice `/sitemap.xml` resta la fonte di verità per i crawler.
 */
export const dynamic = "force-dynamic";

/**
 * ID noti a build senza query DB. Headroom ~320k URL @ 10k/chunk.
 * I chunk oltre il totale reale restituiscono [] a runtime.
 */
const MAX_SITEMAP_CHUNKS = 32;

export async function generateSitemaps() {
  return Array.from({ length: MAX_SITEMAP_CHUNKS }, (_, id) => ({ id }));
}

async function safeCount(
  label: string,
  fn: () => Promise<number>
): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[sitemap] count ${label} failed:`, error);
    return 0;
  }
}

export default async function sitemap(props: {
  id: Promise<number | string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  if (!Number.isFinite(id) || id < 0 || id >= MAX_SITEMAP_CHUNKS) {
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

  const [pubTotal, recallTotal] = await Promise.all([
    safeCount("pub", countPubProductsForSitemap),
    safeCount("recall", countRecallsForSitemap),
  ]);
  // device total non serve per il windowing se usiamo devicesBase = pub+recall
  const offset = id * PUB_SITEMAP_CHUNK_SIZE;
  const chunkEnd = offset + PUB_SITEMAP_CHUNK_SIZE;

  // Layout: pubs [0, pubTotal), recalls [pubTotal, pub+recall),
  // medical devices [pub+recall, pub+recall+device).
  if (offset < pubTotal) {
    const pubLimit = Math.min(PUB_SITEMAP_CHUNK_SIZE, pubTotal - offset);
    try {
      const products = await fetchPubSitemapEntries(offset, pubLimit);
      for (const product of products) {
        entries.push({
          url: `${SITE_URL}/pub/${product.pub_slug}`,
          lastModified: product.lastModified,
          changeFrequency: "daily",
          priority: 0.6,
        });
      }
    } catch (error) {
      console.error(`[sitemap] fetch pub chunk ${id} failed:`, error);
    }
  }

  const recallWindowStart = Math.max(0, offset - pubTotal);
  const recallWindowEnd = Math.max(0, chunkEnd - pubTotal);
  const recallLimit = Math.min(
    recallWindowEnd - recallWindowStart,
    Math.max(0, recallTotal - recallWindowStart)
  );
  if (recallLimit > 0) {
    try {
      const recalls = await fetchRecallSitemapEntries(
        recallWindowStart,
        recallLimit
      );
      for (const recall of recalls) {
        entries.push({
          url: `${SITE_URL}${recallPath(recall.numero_riferimento)}`,
          lastModified: recall.lastModified,
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    } catch (error) {
      console.error(`[sitemap] fetch recall chunk ${id} failed:`, error);
    }
  }

  const devicesBase = pubTotal + recallTotal;
  const deviceWindowStart = Math.max(0, offset - devicesBase);
  const deviceWindowEnd = Math.max(0, chunkEnd - devicesBase);
  const deviceLimit = deviceWindowEnd - deviceWindowStart;
  if (deviceLimit > 0) {
    try {
      const devices = await fetchMedicalDeviceSitemapEntries(
        deviceWindowStart,
        deviceLimit
      );
      for (const device of devices) {
        entries.push({
          url: `${SITE_URL}${medicalDevicePath(device.slug)}`,
          lastModified: device.lastModified,
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    } catch (error) {
      console.error(`[sitemap] fetch medical_device chunk ${id} failed:`, error);
    }
  }

  return entries;
}
