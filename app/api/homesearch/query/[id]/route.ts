import { NextResponse } from "next/server";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";
import {
  softDeleteHomesearchQuery,
  updateHomesearchQuery,
  type HomesearchQueryOther,
  type HomesearchRowStatus,
} from "@/app/lib/search/homesearch-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isRowStatus(value: unknown): value is HomesearchRowStatus {
  return (
    value === "loading" ||
    value === "ready" ||
    value === "empty" ||
    value === "error"
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      results?: unknown;
      selectedId?: unknown;
      quantities?: unknown;
      status?: unknown;
    };

    const other: Partial<HomesearchQueryOther> = {};

    if (body.selectedId === null || typeof body.selectedId === "string") {
      other.selectedId = body.selectedId;
    }

    if (isRowStatus(body.status)) {
      other.status = body.status;
    }

    if (body.quantities && typeof body.quantities === "object") {
      const quantities: Record<string, number> = {};
      for (const [key, qty] of Object.entries(body.quantities)) {
        if (typeof qty === "number" && Number.isFinite(qty)) {
          quantities[key] = Math.max(1, Math.floor(qty));
        }
      }
      other.quantities = quantities;
    }

    const results = Array.isArray(body.results)
      ? (body.results as InlineMatchCandidate[])
      : undefined;

    await updateHomesearchQuery(id, {
      results,
      other: Object.keys(other).length > 0 ? other : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("homesearch query update failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore aggiornamento query";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await softDeleteHomesearchQuery(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("homesearch query delete failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore cancellazione query";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
