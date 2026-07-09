import { NextResponse } from "next/server";
import { searchProductsSemantic } from "@/app/lib/search/product-catalog";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    if (query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchProductsSemantic(query, 10);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Product search failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante la ricerca";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
