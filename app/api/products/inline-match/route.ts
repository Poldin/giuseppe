import { NextResponse } from "next/server";
import { runInlineProductMatch } from "@/app/lib/search/inline-match";

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const body = (await request.json()) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    console.log(`[api/inline-match] POST ricevuto query="${query}"`);

    if (query.length < 2) {
      console.log(`[api/inline-match] reject: query troppo corta`);
      return NextResponse.json(
        { error: "Query troppo corta", matches: [] },
        { status: 400 }
      );
    }

    const matches = await runInlineProductMatch(query);
    console.log(
      `[api/inline-match] OK query="${query}" matches=${matches.length} http=${Date.now() - t0}ms`
    );
    return NextResponse.json({ query, matches });
  } catch (error) {
    console.error(
      `[api/inline-match] FAIL after ${Date.now() - t0}ms:`,
      error
    );
    const message =
      error instanceof Error ? error.message : "Errore durante il confronto";
    return NextResponse.json({ error: message, matches: [] }, { status: 500 });
  }
}
