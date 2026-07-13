import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/SupabaseClient";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      body?: unknown;
      other?: unknown;
    };

    const body =
      typeof payload.body === "string" ? payload.body.trim() : "";

    if (body.length < 3) {
      return NextResponse.json(
        { error: "Scrivi almeno qualche parola per inviare il feedback" },
        { status: 400 }
      );
    }

    if (body.length > 5000) {
      return NextResponse.json(
        { error: "Il messaggio è troppo lungo" },
        { status: 400 }
      );
    }

    const other =
      payload.other && typeof payload.other === "object" && payload.other !== null
        ? payload.other
        : {};

    const { error } = await supabase.from("review_giuseppe").insert({
      body,
      other,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Review submit failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante l'invio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
