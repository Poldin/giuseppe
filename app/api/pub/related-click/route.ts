import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/SupabaseClient";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function asSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      fromProductId?: unknown;
      toProductId?: unknown;
      fromPubSlug?: unknown;
      toPubSlug?: unknown;
    };

    const fromProductId = asUuid(payload.fromProductId);
    const toProductId = asUuid(payload.toProductId);
    const fromPubSlug = asSlug(payload.fromPubSlug);
    const toPubSlug = asSlug(payload.toPubSlug);

    if (!fromProductId || !toProductId) {
      return NextResponse.json(
        { error: "fromProductId e toProductId sono obbligatori" },
        { status: 400 }
      );
    }

    if (fromProductId === toProductId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { error } = await supabase.from("pub_related_click").insert({
      from_product_id: fromProductId,
      to_product_id: toProductId,
      from_pub_slug: fromPubSlug,
      to_pub_slug: toPubSlug,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("pub related-click failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante il tracking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
