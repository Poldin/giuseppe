import { NextResponse } from "next/server";
import {
  searchTypeLanders,
} from "@/app/lib/category/type-lander";
import { searchDocuments } from "@/app/lib/docs/document";
import {
  searchMedicalDevices,
} from "@/app/lib/medical-device/device";
import {
  formatPubPrice,
  searchPubProducts,
} from "@/app/lib/pub/product";
import { searchRecalls } from "@/app/lib/recall/recall";
import type { SeoHubHit } from "@/app/lib/seo/hub-hit";
import {
  assetTypeLabel,
  assetTypeShort,
  docsPath,
} from "@/app/lib/seo/docs";
import { medicalDevicePath } from "@/app/lib/seo/medical-device";
import { pubProductPath } from "@/app/lib/seo/pub-product";
import { recallPath } from "@/app/lib/seo/recall";
import {
  typeLanderPath,
} from "@/app/lib/seo/type-lander";
import { vsCombinationPath } from "@/app/lib/seo/vs-combination";
import { searchVsCombinations } from "@/app/lib/vs/combination";

const HUBS = [
  "pub",
  "vs",
  "recall",
  "medical_device",
  "categorie",
  "docs",
] as const;

type Hub = (typeof HUBS)[number];

function isHub(value: string): value is Hub {
  return (HUBS as readonly string[]).includes(value);
}

async function searchHub(hub: Hub, q: string): Promise<SeoHubHit[]> {
  switch (hub) {
    case "pub": {
      const rows = await searchPubProducts(q);
      return rows.map((hit) => {
        const price = formatPubPrice(hit.final_price);
        const meta = [hit.brand, hit.shop_name].filter(Boolean).join(" · ");
        return {
          href: pubProductPath(hit.pub_slug),
          title: hit.product_name,
          eyebrow: meta || null,
          hint: price ? `${price} — apri scheda` : "Apri scheda prodotto",
        };
      });
    }
    case "vs": {
      const rows = await searchVsCombinations(q);
      return rows.map((hit) => ({
        href: vsCombinationPath(hit.slug),
        title: hit.canonical_name,
        hint: "Apri miglior prezzo",
      }));
    }
    case "recall": {
      const rows = await searchRecalls(q);
      return rows.map((hit) => {
        const meta = [hit.fabbricante, hit.tipo_dispositivo]
          .filter(Boolean)
          .join(" · ");
        return {
          href: recallPath(hit.numero_riferimento),
          title: hit.name,
          eyebrow: meta || `N. ${hit.numero_riferimento}`,
          hint: `Avviso ${hit.numero_riferimento} — apri scheda`,
        };
      });
    }
    case "medical_device": {
      const rows = await searchMedicalDevices(q);
      return rows.map((hit) => {
        const meta = [hit.fabbricante, hit.classificazione_cnd]
          .filter(Boolean)
          .join(" · ");
        return {
          href: medicalDevicePath(hit.slug),
          title: hit.name,
          eyebrow: meta || null,
          hint: "Apri scheda dispositivo",
        };
      });
    }
    case "categorie": {
      const rows = await searchTypeLanders(q);
      return rows.map((hit) => {
        const count = hit.product_count.toLocaleString("it-IT");
        const avg = formatPubPrice(hit.avg_price);
        return {
          href: typeLanderPath(hit.slug),
          title: hit.seo_title,
          eyebrow: avg
            ? `${count} prodotti · media ${avg}`
            : `${count} prodotti`,
          hint: "Apri categoria",
        };
      });
    }
    case "docs": {
      const rows = await searchDocuments(q);
      return rows.map((hit) => ({
        href: docsPath(hit.slug),
        title: hit.title,
        eyebrow:
          `${assetTypeShort(hit.asset_type)}` +
          (hit.source_name ? ` · ${hit.source_name}` : "") +
          (!hit.is_active ? " · non più attivo" : ""),
        hint: `${assetTypeLabel(hit.asset_type)} — apri scheda e scarica PDF`,
      }));
    }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hubRaw = (searchParams.get("hub") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();

    if (!isHub(hubRaw)) {
      return NextResponse.json(
        { error: "hub non valido" },
        { status: 400 }
      );
    }
    if (q.length < 1) {
      return NextResponse.json({ hits: [] as SeoHubHit[] });
    }

    const hits = await searchHub(hubRaw, q);
    return NextResponse.json(
      { hits },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("hub search failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore ricerca hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
