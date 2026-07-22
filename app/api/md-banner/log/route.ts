import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/SupabaseClient";

const ALLOWED_TYPES = new Set(["close_banner", "book_call"] as const);

type BannerLogType = "close_banner" | "book_call";

function asType(value: unknown): BannerLogType | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return ALLOWED_TYPES.has(trimmed as BannerLogType)
    ? (trimmed as BannerLogType)
    : null;
}

function asPageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  return trimmed;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      type?: unknown;
      page_url?: unknown;
    };

    const type = asType(payload.type);
    const pageUrl = asPageUrl(payload.page_url);

    if (!type || !pageUrl) {
      return NextResponse.json(
        { error: "type e page_url sono obbligatori" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("log_md_banner").insert({
      type,
      page_url: pageUrl,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("md-banner log failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante il tracking";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
