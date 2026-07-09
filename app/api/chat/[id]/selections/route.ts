import { NextResponse } from "next/server";
import {
  getProductSearchChat,
  updateProductSearchChat,
} from "@/app/lib/search/chat-store";
import { parseCardStatePayload } from "@/app/lib/search/card-selection-state";
import type { RisultatoConfronto } from "@/app/lib/search/elabora-scenari";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isConfronto(value: unknown): value is RisultatoConfronto {
  return (
    typeof value === "object" &&
    value !== null &&
    "tabelle_ecommerce" in value &&
    "scenario_risparmio" in value
  );
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { cardState?: unknown };
    const cardState = parseCardStatePayload(body.cardState);

    if (!cardState) {
      return NextResponse.json(
        { error: "Stato selezione non valido" },
        { status: 400 }
      );
    }

    const chat = await getProductSearchChat(id);
    if (!chat || !isConfronto(chat.results)) {
      return NextResponse.json({ error: "Ricerca non trovata" }, { status: 404 });
    }

    await updateProductSearchChat(id, {
      products: chat.products,
      results: {
        ...chat.results,
        user_card_state: cardState,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save selections failed:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Errore durante il salvataggio delle selezioni";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
