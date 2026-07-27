import {
  countAifaAtcForSitemap,
  countAifaCompaniesForSitemap,
  countAifaGroupsForSitemap,
  countAifaIngredientsForSitemap,
  countAifaMedicinesForSitemap,
  fetchAifaAtcSitemapEntries,
  fetchAifaCompanySitemapEntries,
  fetchAifaGroupSitemapEntries,
  fetchAifaIngredientSitemapEntries,
  fetchAifaMedicineSitemapEntries,
} from "@/app/lib/aifa/queries";
import {
  countDocsForSitemap,
  fetchDocSitemapEntries,
} from "@/app/lib/docs/document";
import {
  countMedicalDevicesForSitemap,
  fetchMedicalDeviceSitemapEntries,
} from "@/app/lib/medical-device/device";
import {
  countPubProductsForSitemap,
  fetchPubSitemapEntries,
  MAX_SITEMAP_CHUNKS,
  PUB_SITEMAP_CHUNK_SIZE,
} from "@/app/lib/pub/product";
import {
  countRecallsForSitemap,
  fetchRecallSitemapEntries,
} from "@/app/lib/recall/recall";
import {
  countVsCombinationsForSitemap,
  fetchVsSitemapEntries,
} from "@/app/lib/vs/combination";
import {
  atcPath,
  dittaPath,
  equivalentiPath,
  farmacoPath,
  listaTrasparenzaPath,
  principioAttivoPath,
} from "@/app/lib/seo/aifa";
import { docsPath } from "@/app/lib/seo/docs";
import { medicalDevicePath } from "@/app/lib/seo/medical-device";
import { getNotazioneDentaleSitemapEntries } from "@/app/lib/seo/notazione-dentale";
import { recallPath } from "@/app/lib/seo/recall";
import { vsCombinationPath } from "@/app/lib/seo/vs-combination";
import { SITE_URL } from "@/app/lib/seo/site";
import type { MetadataRoute } from "next";

/**
 * Non pre-renderizzare i chunk a build-time (evita timeout Supabase su Vercel
 * con molte URL: pub + vs + recall + medical_device + docs + notazione-dentale).
 * L'indice `/sitemap.xml` resta la fonte di verità per i crawler.
 */
export const dynamic = "force-dynamic";

export async function generateSitemaps() {
  return Array.from({ length: MAX_SITEMAP_CHUNKS }, (_, id) => ({ id }));
}

async function safeCount(
  label: string,
  fn: () => Promise<number>
): Promise<number> {
  const attempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(
        `[sitemap] count ${label} failed (attempt ${attempt}/${attempts}):`,
        error
      );
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 150 * attempt));
      }
    }
  }
  console.error(`[sitemap] count ${label} gave up:`, lastError);
  return 0;
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
    entries.push({
      url: `${SITE_URL}/docs/search`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    });
    entries.push({
      url: `${SITE_URL}${listaTrasparenzaPath()}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    });
    // Hub + 32 denti: dati statici, niente DB.
    for (const entry of getNotazioneDentaleSitemapEntries()) {
      entries.push({
        url: entry.url,
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      });
    }
  }

  const [
    pubTotal,
    vsTotal,
    recallTotal,
    deviceTotal,
    docsTotal,
    aifaGroupTotal,
    aifaIngredientTotal,
    aifaMedicineTotal,
    aifaCompanyTotal,
    aifaAtcTotal,
  ] = await Promise.all([
    safeCount("pub", countPubProductsForSitemap),
    safeCount("vs", countVsCombinationsForSitemap),
    safeCount("recall", countRecallsForSitemap),
    safeCount("medical_device", countMedicalDevicesForSitemap),
    safeCount("docs", countDocsForSitemap),
    safeCount("aifa_groups", countAifaGroupsForSitemap),
    safeCount("aifa_ingredients", countAifaIngredientsForSitemap),
    safeCount("aifa_medicines", countAifaMedicinesForSitemap),
    safeCount("aifa_companies", countAifaCompaniesForSitemap),
    safeCount("aifa_atc", countAifaAtcForSitemap),
  ]);
  const offset = id * PUB_SITEMAP_CHUNK_SIZE;
  const chunkEnd = offset + PUB_SITEMAP_CHUNK_SIZE;

  // Layout: pubs [0, pubTotal),
  // vs [pubTotal, pub+vs),
  // recalls [pub+vs, …),
  // medical devices …,
  // docs …
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

  const vsBase = pubTotal;
  const vsWindowStart = Math.max(0, offset - vsBase);
  const vsWindowEnd = Math.max(0, chunkEnd - vsBase);
  const vsLimit = Math.min(
    vsWindowEnd - vsWindowStart,
    Math.max(0, vsTotal - vsWindowStart)
  );
  if (vsLimit > 0) {
    try {
      const combinations = await fetchVsSitemapEntries(vsWindowStart, vsLimit);
      for (const combo of combinations) {
        entries.push({
          url: `${SITE_URL}${vsCombinationPath(combo.slug)}`,
          lastModified: combo.lastModified,
          changeFrequency: "daily",
          priority: 0.65,
        });
      }
    } catch (error) {
      console.error(`[sitemap] fetch vs chunk ${id} failed:`, error);
    }
  }

  const recallBase = pubTotal + vsTotal;
  const recallWindowStart = Math.max(0, offset - recallBase);
  const recallWindowEnd = Math.max(0, chunkEnd - recallBase);
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

  const devicesBase = pubTotal + vsTotal + recallTotal;
  const deviceWindowStart = Math.max(0, offset - devicesBase);
  const deviceWindowEnd = Math.max(0, chunkEnd - devicesBase);
  const deviceLimit = Math.min(
    deviceWindowEnd - deviceWindowStart,
    Math.max(0, deviceTotal - deviceWindowStart)
  );
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

  const docsBase = pubTotal + vsTotal + recallTotal + deviceTotal;
  const docsWindowStart = Math.max(0, offset - docsBase);
  const docsWindowEnd = Math.max(0, chunkEnd - docsBase);
  const docsLimit = Math.min(
    docsWindowEnd - docsWindowStart,
    Math.max(0, docsTotal - docsWindowStart)
  );
  if (docsLimit > 0) {
    try {
      const docs = await fetchDocSitemapEntries(docsWindowStart, docsLimit);
      for (const doc of docs) {
        entries.push({
          url: `${SITE_URL}${docsPath(doc.slug)}`,
          lastModified: doc.lastModified,
          changeFrequency: "weekly",
          priority: 0.55,
        });
      }
    } catch (error) {
      console.error(`[sitemap] fetch docs chunk ${id} failed:`, error);
    }
  }

  const aifaSegments: {
    label: string;
    total: number;
    fetch: (
      start: number,
      limit: number
    ) => Promise<{ slug: string; lastModified: Date | undefined }[]>;
    path: (slug: string) => string;
    priority: number;
  }[] = [
    {
      label: "aifa_groups",
      total: aifaGroupTotal,
      fetch: fetchAifaGroupSitemapEntries,
      path: equivalentiPath,
      priority: 0.75,
    },
    {
      label: "aifa_ingredients",
      total: aifaIngredientTotal,
      fetch: fetchAifaIngredientSitemapEntries,
      path: principioAttivoPath,
      priority: 0.7,
    },
    {
      label: "aifa_medicines",
      total: aifaMedicineTotal,
      fetch: fetchAifaMedicineSitemapEntries,
      path: farmacoPath,
      priority: 0.65,
    },
    {
      label: "aifa_companies",
      total: aifaCompanyTotal,
      fetch: fetchAifaCompanySitemapEntries,
      path: dittaPath,
      priority: 0.45,
    },
    {
      label: "aifa_atc",
      total: aifaAtcTotal,
      fetch: fetchAifaAtcSitemapEntries,
      path: atcPath,
      priority: 0.45,
    },
  ];

  let aifaBase = docsBase + docsTotal;
  for (const seg of aifaSegments) {
    const windowStart = Math.max(0, offset - aifaBase);
    const windowEnd = Math.max(0, chunkEnd - aifaBase);
    const limit = Math.min(
      windowEnd - windowStart,
      Math.max(0, seg.total - windowStart)
    );
    if (limit > 0) {
      try {
        const rows = await seg.fetch(windowStart, limit);
        for (const row of rows) {
          entries.push({
            url: `${SITE_URL}${seg.path(row.slug)}`,
            lastModified: row.lastModified,
            changeFrequency: "weekly",
            priority: seg.priority,
          });
        }
      } catch (error) {
        console.error(`[sitemap] fetch ${seg.label} chunk ${id} failed:`, error);
      }
    }
    aifaBase += seg.total;
  }

  return entries;
}
