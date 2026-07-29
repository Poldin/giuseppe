import { NextResponse } from "next/server";
import { createHomesearchSession } from "@/app/lib/search/homesearch-store";

export async function POST() {
  try {
    const sessionId = await createHomesearchSession();
    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error("homesearch session create failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore creazione sessione";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
