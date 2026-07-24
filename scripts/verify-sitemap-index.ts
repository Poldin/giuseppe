/**
 * Esegue la stessa logica di GET /sitemap.xml e controlla il numero di chunk.
 * Usage: npx tsx scripts/verify-sitemap-index.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

async function main() {
  const { GET } = await import("../app/sitemap-index.xml/route");
  const res = await GET();
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const chunkIds = locs
    .map((loc) => {
      const m = loc.match(/\/sitemap\/(\d+)\.xml$/);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n != null);

  console.log(`status-ish ok, Content-Type=${res.headers.get("content-type")}`);
  console.log(`sitemap entries=${locs.length}`);
  console.log(`chunk ids: ${chunkIds[0]}..${chunkIds[chunkIds.length - 1]}`);
  console.log(xml.slice(0, 500));

  if (locs.length < 2) {
    console.error("FAIL: index must list more than 1 chunk");
    process.exit(1);
  }
  if (chunkIds[0] !== 0 || chunkIds[chunkIds.length - 1] !== locs.length - 1) {
    console.error("FAIL: chunk ids must be contiguous from 0");
    process.exit(1);
  }
  // Catalogo attuale ~160k URL → almeno ~16 chunk; soglia bassa per non essere fragili
  if (locs.length < 10) {
    console.error(`FAIL: expected >=10 chunks, got ${locs.length}`);
    process.exit(1);
  }
  console.log(`OK: /sitemap.xml would advertise ${locs.length} chunks`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
