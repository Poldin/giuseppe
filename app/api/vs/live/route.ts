import { isCrawlerUserAgent } from "@/app/lib/http/crawler";
import { fetchVsCombinationBySlug } from "@/app/lib/vs/combination";
import { NextResponse } from "next/server";

const LIVE_CACHE_SECONDS = 43_200;

export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent");
  if (isCrawlerUserAgent(userAgent)) {
    return NextResponse.json(
      { combination: null },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 300) {
    return NextResponse.json({ error: "slug obbligatorio" }, { status: 400 });
  }

  try {
    const combination = await fetchVsCombinationBySlug(slug);
    if (!combination) {
      return NextResponse.json({ combination: null }, { status: 404 });
    }

    return NextResponse.json(
      { combination },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${LIVE_CACHE_SECONDS}, stale-while-revalidate=86400`,
        },
      }
    );
  } catch (error) {
    console.error("vs live failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore lettura combination";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
