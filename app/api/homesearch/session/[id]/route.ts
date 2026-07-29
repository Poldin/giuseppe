import { NextResponse } from "next/server";
import {
  getHomesearchSession,
  softDeleteSessionQueries,
} from "@/app/lib/search/homesearch-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
