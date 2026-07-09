import type { EcommerceSite, SearchHit } from "./types";

function getTavilyApiKey(): string {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY non configurata");
  }
  return apiKey;
}

function siteDomain(site: EcommerceSite): string {
  return new URL(site.url).hostname.replace(/^www\./, "");
}

export async function searchProductOnSite(
  product: string,
  site: EcommerceSite
): Promise<SearchHit | null> {
  const apiKey = getTavilyApiKey();
  const domain = siteDomain(site);

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: product,
      search_depth: "basic",
      max_results: 3,
      country: "italy",
      include_domains: [domain],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `[Tavily] Ricerca fallita per "${product}" su ${site.name}:`,
      errorBody
    );
    return null;
  }

  const payload = (await response.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
    }>;
  };

  console.log(
    `[Tavily] "${product}" su ${site.name} (${domain}):`,
    JSON.stringify(payload.results ?? [], null, 2)
  );

  const firstHit = payload.results?.[0];
  if (!firstHit?.url) {
    console.log(`[Tavily] "${product}" su ${site.name}: nessun risultato`);
    return null;
  }

  const hit: SearchHit = {
    title: firstHit.title?.trim() || product,
    description: firstHit.content?.trim() || "",
    url: firstHit.url,
    content: firstHit.content,
  };

  console.log(`[Tavily] "${product}" su ${site.name} — top hit:`, hit);

  return hit;
}
