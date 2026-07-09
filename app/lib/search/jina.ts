import type { EcommerceSite, SearchHit } from "./types";

let loggedNoKeyMode = false;

function buildJinaHeaders(siteUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Site": siteUrl,
    "X-No-Cache": "true",
  };

  const apiKey = process.env.JINA_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function searchProductOnSite(
  product: string,
  site: EcommerceSite
): Promise<SearchHit | null> {
  const hasApiKey = Boolean(process.env.JINA_API_KEY?.trim());
  if (!hasApiKey && !loggedNoKeyMode) {
    loggedNoKeyMode = true;
    console.log("[Jina] Modalità senza API key (~20 req/min)");
  }

  const response = await fetch("https://s.jina.ai/", {
    method: "POST",
    headers: buildJinaHeaders(site.url),
    body: JSON.stringify({
      q: product,
      hl: "it",
      gl: "it",
      num: 3,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Jina search failed for "${product}" on ${site.name}:`, errorBody);
    return null;
  }

  const payload = (await response.json()) as {
    data?: Array<{
      title?: string;
      description?: string;
      url?: string;
      content?: string;
    }>;
  };

  console.log(
    `[Jina] "${product}" su ${site.name} (${site.url}):`,
    JSON.stringify(payload.data ?? [], null, 2)
  );

  const firstHit = payload.data?.[0];
  if (!firstHit?.url) {
    console.log(`[Jina] "${product}" su ${site.name}: nessun risultato`);
    return null;
  }

  const hit = {
    title: firstHit.title?.trim() || product,
    description: firstHit.description?.trim() || "",
    url: firstHit.url,
    content: firstHit.content,
  };

  console.log(`[Jina] "${product}" su ${site.name} — top hit:`, hit);

  return hit;
}
