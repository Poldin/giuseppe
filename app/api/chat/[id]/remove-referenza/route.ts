import { NextResponse } from "next/server";
import {
  getProductSearchChat,
  updateProductSearchChat,
} from "@/app/lib/search/chat-store";
import { removeReferenzaFromConfronto } from "@/app/lib/search/merge-referenza";
import { removeUserCardStateForReferenza } from "@/app/lib/search/card-selection-state";
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
    const body = (await request.json()) as { queryIndex?: unknown };
    const queryIndex = Number(body.queryIndex);

    if (!Number.isInteger(queryIndex) || queryIndex < 0) {
      return NextResponse.json(
        { error: "Indice referenza non valido" },
        { status: 400 }
      );
    }

    const chat = await getProductSearchChat(id);
    if (!chat || !isConfronto(chat.results)) {
      return NextResponse.json({ error: "Ricerca non trovata" }, { status: 404 });
    }

    const updated = removeReferenzaFromConfronto(chat.results, queryIndex);
    const user_card_state = removeUserCardStateForReferenza(
      chat.results.user_card_state,
      queryIndex
    );

    await updateProductSearchChat(id, {
      products: updated.prodotti_richiesti,
      results: {
        ...updated,
        user_card_state,
      },
    });

    return NextResponse.json({ confronto: updated, queryIndex });
  } catch (error) {
    console.error("Remove referenza failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante l'eliminazione";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
