/**
 * Trigram similarity stile pg_trgm (Dice su trigrammi, padding spazi).
 * Adeguato a ~10³ candidati post-RPC in TypeScript.
 */

export function normalizeForTrigram(text: string): string {
  const lowered = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  return lowered
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractTrigrams(normalized: string): Set<string> {
  const padded = `  ${normalized} `;
  const set = new Set<string>();
  if (padded.length < 3) return set;

  for (let i = 0; i <= padded.length - 3; i += 1) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Dice coefficient ∈ [0, 1] tra due stringhe normalizzate o grezze. */
export function trigramSimilarity(a: string, b: string): number {
  const na = normalizeForTrigram(a);
  const nb = normalizeForTrigram(b);

  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = extractTrigrams(na);
  const tb = extractTrigrams(nb);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let intersection = 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) {
    if (large.has(t)) intersection += 1;
  }

  return (2 * intersection) / (ta.size + tb.size);
}
