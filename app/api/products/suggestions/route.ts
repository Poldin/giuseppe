import { NextResponse } from "next/server";
import { fetchRandomProductSuggestions } from "@/app/lib/search/product-catalog";

export async function GET() {
  try {
    const suggestions = await fetchRandomProductSuggestions(15);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Product suggestions failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore caricamento suggerimenti";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
