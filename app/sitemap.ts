import {
  countMedicalDevicesForSitemap,
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

export async function generateSitemaps() {
  const [pubTotal, recallTotal, deviceTotal] = await Promise.all([
    countPubProductsForSitemap(),
    countRecallsForSitemap(),
    countMedicalDevicesForSitemap(),
  ]);
  const total = pubTotal + recallTotal + deviceTotal;
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

  const [pubTotal, recallTotal] = await Promise.all([
    countPubProductsForSitemap(),
    countRecallsForSitemap(),
  ]);
  const offset = id * PUB_SITEMAP_CHUNK_SIZE;
  const chunkEnd = offset + PUB_SITEMAP_CHUNK_SIZE;

  // Layout: pubs [0, pubTotal), recalls [pubTotal, pub+recall),
  // medical devices [pub+recall, pub+recall+device).
  if (offset < pubTotal) {
    const pubLimit = Math.min(PUB_SITEMAP_CHUNK_SIZE, pubTotal - offset);
    const products = await fetchPubSitemapEntries(offset, pubLimit);
    for (const product of products) {
      entries.push({
        url: `${SITE_URL}/pub/${product.pub_slug}`,
        lastModified: product.lastModified,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  }

  const recallWindowStart = Math.max(0, offset - pubTotal);
  const recallWindowEnd = Math.max(0, chunkEnd - pubTotal);
  const recallLimit = Math.min(
    recallWindowEnd - recallWindowStart,
    Math.max(0, recallTotal - recallWindowStart)
  );
  if (recallLimit > 0) {
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
  }

  const devicesBase = pubTotal + recallTotal;
  const deviceWindowStart = Math.max(0, offset - devicesBase);
  const deviceWindowEnd = Math.max(0, chunkEnd - devicesBase);
  const deviceLimit = deviceWindowEnd - deviceWindowStart;
  if (deviceLimit > 0) {
    const devices = await fetchMedicalDeviceSitemapEntries(
      deviceWindowStart,
      deviceLimit
    );
    for (const device of devices) {
      entries.push({
        url: `${SITE_URL}${medicalDevicePath(device.slug)}`,
        lastModified: device.lastModified,
        // Allineato a /recall: open data stabili, refresh ~settimanale
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  return entries;
}
