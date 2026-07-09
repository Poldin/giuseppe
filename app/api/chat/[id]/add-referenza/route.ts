import { NextResponse } from "next/server";
import {
  getProductSearchChat,
  updateProductSearchChat,
} from "@/app/lib/search/chat-store";
import { addReferenzaToConfronto } from "@/app/lib/search/merge-referenza";
import { shiftUserCardStateAfterInsert } from "@/app/lib/search/card-selection-state";
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
    const body = (await request.json()) as {
      insertAfterIndex?: unknown;
      productName?: unknown;
    };

    const insertAfterIndex = Number(body.insertAfterIndex);
    const productName =
      typeof body.productName === "string" ? body.productName.trim() : "";

    if (!Number.isInteger(insertAfterIndex) || insertAfterIndex < -1) {
      return NextResponse.json(
        { error: "Posizione di inserimento non valida" },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        { error: "Nome prodotto obbligatorio" },
        { status: 400 }
      );
    }

    const chat = await getProductSearchChat(id);
    if (!chat || !isConfronto(chat.results)) {
      return NextResponse.json({ error: "Ricerca non trovata" }, { status: 404 });
    }

    const confronto = chat.results;

    if (insertAfterIndex >= confronto.prodotti_richiesti.length) {
      return NextResponse.json(
        { error: "Posizione di inserimento non valida" },
        { status: 400 }
      );
    }

    const updated = await addReferenzaToConfronto(
      confronto,
      insertAfterIndex,
      productName
    );
    const user_card_state = shiftUserCardStateAfterInsert(
      confronto.user_card_state,
      insertAfterIndex
    );

    await updateProductSearchChat(id, {
      products: updated.prodotti_richiesti,
      results: {
        ...updated,
        user_card_state,
      },
    });

    const newRow = updated.top_match_per_referenza?.find(
      (row) => row.query_text === productName && row.query_index === insertAfterIndex + 1
    );

    return NextResponse.json({
      confronto: updated,
      insertAfterIndex,
      newRow,
    });
  } catch (error) {
    console.error("Add referenza failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante l'aggiunta";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
