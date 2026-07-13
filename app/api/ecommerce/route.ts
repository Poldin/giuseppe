import { NextResponse } from "next/server";
import { fetchEcommerceCatalog } from "@/app/lib/search/match-products";

export async function GET() {
  try {
    const ecommerces = await fetchEcommerceCatalog();
    return NextResponse.json({ ecommerces });
  } catch (error) {
    console.error("Ecommerce catalog fetch failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante il caricamento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
