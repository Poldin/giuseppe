import { NextResponse } from "next/server";
import { saveProductSearchChat } from "@/app/lib/search/chat-store";
import { runProductListSearch } from "@/app/lib/search/run-search";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      products?: unknown;
      queryText?: string;
    };

    const products = Array.isArray(body.products)
      ? body.products
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    if (products.length === 0) {
      return NextResponse.json(
        { error: "Aggiungi almeno un prodotto alla lista" },
        { status: 400 }
      );
    }

    const queryText = body.queryText?.trim() || products.join(", ");
    const { products: cleaned, confronto } = await runProductListSearch(products);

    const chatId = await saveProductSearchChat({
      queryText,
      products: cleaned,
      results: confronto,
    });

    return NextResponse.json({ chatId });
  } catch (error) {
    console.error("Product search failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante la ricerca";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
