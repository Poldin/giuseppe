import { NextResponse } from "next/server";
import {
  getHomesearchSession,
  softDeleteSessionQueries,
  updateHomesearchSessionOther,
  type HomesearchCartLineRef,
} from "@/app/lib/search/homesearch-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseCartBody(value: unknown): HomesearchCartLineRef[] | null {
  if (!Array.isArray(value)) return null;
  const lines: HomesearchCartLineRef[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.rowId !== "string" || typeof row.matchId !== "string") continue;
    const quantity =
      typeof row.quantity === "number" && Number.isFinite(row.quantity)
        ? Math.max(1, Math.floor(row.quantity))
        : 1;
    lines.push({ rowId: row.rowId, matchId: row.matchId, quantity });
  }
  return lines;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getHomesearchSession(id);
    if (!session) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error) {
    console.error("homesearch session get failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore lettura sessione";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { cart?: unknown };
    const cart = parseCartBody(body.cart);
    if (cart === null) {
      return NextResponse.json(
        { error: "Body non valido: serve cart[]" },
        { status: 400 }
      );
    }

    await updateHomesearchSessionOther(id, { cart });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("homesearch session update failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore aggiornamento sessione";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await softDeleteSessionQueries(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("homesearch session clear failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore cancellazione sessione";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
