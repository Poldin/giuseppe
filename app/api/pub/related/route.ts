import {
  fetchPubProductBySlug,
} from "@/app/lib/pub/product";
import { fetchRelatedPubProducts } from "@/app/lib/pub/related";
import { NextResponse } from "next/server";

const RELATED_CACHE_SECONDS = 43_200;

/** Bot ufficiali / crawler: niente trgm. */
function isCrawlerUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /bot|crawler|spider|slurp|facebookexternalhit|embedly|quora link preview|bingpreview|linkedinbot|skypeuripreview|applebot|semrush|ahrefs|mj12bot|dotbot|gptbot|claudebot|google-extended|bytespider|amazonbot|petalbot|duckduckbot|yandex/i.test(
    userAgent
  );
}

export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent");
  if (isCrawlerUserAgent(userAgent)) {
    return NextResponse.json(
      { products: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: "slug obbligatorio" }, { status: 400 });
  }

  try {
    const product = await fetchPubProductBySlug(slug);
    if (!product) {
      return NextResponse.json({ products: [] }, { status: 404 });
    }

    const products = await fetchRelatedPubProducts(product);

    return NextResponse.json(
      { products },
      {
        headers: {
          // Stesso orizzonte della page ISR: 1 trgm / slug / 12h anche tra umani.
          "Cache-Control": `public, s-maxage=${RELATED_CACHE_SECONDS}, stale-while-revalidate=86400`,
        },
      }
    );
  } catch (error) {
    console.error("pub related failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore lettura correlati";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
