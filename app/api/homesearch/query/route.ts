import { NextResponse } from "next/server";
import { createHomesearchQuery } from "@/app/lib/search/homesearch-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: unknown;
      query?: unknown;
      clientRowId?: unknown;
    };

    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const clientRowId =
      typeof body.clientRowId === "string" ? body.clientRowId.trim() : undefined;

    if (!sessionId || !query) {
      return NextResponse.json(
        { error: "sessionId e query sono obbligatori" },
        { status: 400 }
      );
    }

    const queryId = await createHomesearchQuery({
      sessionId,
      query,
      clientRowId,
    });

    return NextResponse.json({ queryId });
  } catch (error) {
    console.error("homesearch query create failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore salvataggio query";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
