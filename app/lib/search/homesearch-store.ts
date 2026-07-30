import { supabase } from "@/app/lib/SupabaseClient";
import type { InlineMatchCandidate } from "@/app/lib/search/inline-match";

export type HomesearchRowStatus = "loading" | "ready" | "empty" | "error";

export type HomesearchQueryOther = {
  selectedId: string | null;
  quantities: Record<string, number>;
  status: HomesearchRowStatus;
  client_row_id?: string;
  removed_at?: string | null;
};

/** Minimal cart line stored on the session — product details come from query results. */
export type HomesearchCartLineRef = {
  rowId: string;
  matchId: string;
  quantity: number;
};

export type HomesearchSessionOther = {
  /**
   * Cart snapshot for share/reload.
   * `undefined` = legacy session (cart not persisted yet) → UI falls back to selected matches.
   */
  cart?: HomesearchCartLineRef[];
};

export type HomesearchQueryRow = {
  id: string;
  created_at: string;
  session_id: string;
  query: string;
  results: InlineMatchCandidate[];
  other: HomesearchQueryOther;
};

export type HomesearchSessionSnapshot = {
  id: string;
  created_at: string;
  other: HomesearchSessionOther;
  queries: HomesearchQueryRow[];
};

function isMatchCandidate(value: unknown): value is InlineMatchCandidate {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.product_name === "string" &&
    typeof row.prezzo === "number" &&
    typeof row.ecommerce_id === "string"
  );
}

function parseResults(value: unknown): InlineMatchCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMatchCandidate);
}

function parseOther(value: unknown): HomesearchQueryOther {
  if (typeof value !== "object" || value === null) {
    return {
      selectedId: null,
      quantities: {},
      status: "empty",
    };
  }

  const row = value as Record<string, unknown>;
  const quantitiesRaw = row.quantities;
  const quantities: Record<string, number> = {};
  if (quantitiesRaw && typeof quantitiesRaw === "object") {
    for (const [key, qty] of Object.entries(quantitiesRaw)) {
      if (typeof qty === "number" && Number.isFinite(qty)) {
        quantities[key] = Math.max(1, Math.floor(qty));
      }
    }
  }

  const status =
    row.status === "loading" ||
    row.status === "ready" ||
    row.status === "empty" ||
    row.status === "error"
      ? row.status
      : "empty";

  return {
    selectedId: typeof row.selectedId === "string" ? row.selectedId : null,
    quantities,
    status,
    client_row_id:
      typeof row.client_row_id === "string" ? row.client_row_id : undefined,
    removed_at:
      typeof row.removed_at === "string" ? row.removed_at : null,
  };
}

function parseCartRefs(value: unknown): HomesearchCartLineRef[] {
  if (!Array.isArray(value)) return [];
  const lines: HomesearchCartLineRef[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.rowId !== "string" || typeof row.matchId !== "string") continue;
    const qty =
      typeof row.quantity === "number" && Number.isFinite(row.quantity)
        ? Math.max(1, Math.floor(row.quantity))
        : 1;
    lines.push({ rowId: row.rowId, matchId: row.matchId, quantity: qty });
  }
  return lines;
}

export function parseSessionOther(value: unknown): HomesearchSessionOther {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const row = value as Record<string, unknown>;
  if (!("cart" in row)) {
    return {};
  }
  return { cart: parseCartRefs(row.cart) };
}

function mapQueryRow(data: {
  id: string;
  created_at: string;
  session_id: string | null;
  query: string | null;
  results: unknown;
  other: unknown;
}): HomesearchQueryRow | null {
  if (!data.session_id || !data.query) return null;
  return {
    id: data.id,
    created_at: data.created_at,
    session_id: data.session_id,
    query: data.query,
    results: parseResults(data.results),
    other: parseOther(data.other),
  };
}

export async function createHomesearchSession(): Promise<string> {
  const { data, error } = await supabase
    .from("homesearch_session")
    .insert({ other: { cart: [] } satisfies HomesearchSessionOther })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Impossibile creare la sessione di ricerca");
  }

  return data.id;
}

export async function updateHomesearchSessionOther(
  sessionId: string,
  patch: Partial<HomesearchSessionOther>
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("homesearch_session")
    .select("other")
    .eq("id", sessionId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }
  if (!existing) {
    throw new Error("Sessione non trovata");
  }

  const current = parseSessionOther(existing.other);
  const next: HomesearchSessionOther = {
    ...current,
    ...patch,
  };

  const { error } = await supabase
    .from("homesearch_session")
    .update({ other: next })
    .eq("id", sessionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createHomesearchQuery(input: {
  sessionId: string;
  query: string;
  clientRowId?: string;
}): Promise<string> {
  const other: HomesearchQueryOther = {
    selectedId: null,
    quantities: {},
    status: "loading",
    client_row_id: input.clientRowId,
  };

  const { data, error } = await supabase
    .from("homesearch_query")
    .insert({
      session_id: input.sessionId,
      query: input.query,
      results: [],
      other,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Impossibile salvare la query");
  }

  return data.id;
}

export async function updateHomesearchQuery(
  queryId: string,
  patch: {
    results?: InlineMatchCandidate[];
    other?: Partial<HomesearchQueryOther>;
  }
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from("homesearch_query")
    .select("other, results")
    .eq("id", queryId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }
  if (!existing) {
    throw new Error("Query non trovata");
  }

  const currentOther = parseOther(existing.other);
  const nextOther: HomesearchQueryOther = {
    ...currentOther,
    ...patch.other,
    quantities: patch.other?.quantities ?? currentOther.quantities,
  };

  const payload: {
    results?: InlineMatchCandidate[];
    other: HomesearchQueryOther;
  } = {
    other: nextOther,
  };

  if (patch.results !== undefined) {
    payload.results = patch.results;
  }

  const { error } = await supabase
    .from("homesearch_query")
    .update(payload)
    .eq("id", queryId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function softDeleteHomesearchQuery(queryId: string): Promise<void> {
  await updateHomesearchQuery(queryId, {
    other: { removed_at: new Date().toISOString() },
  });
}

export async function softDeleteSessionQueries(sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("homesearch_query")
    .select("id, other")
    .eq("session_id", sessionId);

  if (error) {
    throw new Error(error.message);
  }

  const removedAt = new Date().toISOString();
  const active = (data ?? []).filter((row) => {
    const other = parseOther(row.other);
    return !other.removed_at;
  });

  await Promise.all([
    updateHomesearchSessionOther(sessionId, { cart: [] }),
    ...active.map(async (row) => {
      const other = parseOther(row.other);
      const { error: updateError } = await supabase
        .from("homesearch_query")
        .update({ other: { ...other, removed_at: removedAt } })
        .eq("id", row.id);
      if (updateError) {
        throw new Error(updateError.message);
      }
    }),
  ]);
}

export async function getHomesearchSession(
  sessionId: string
): Promise<HomesearchSessionSnapshot | null> {
  const { data: session, error: sessionError } = await supabase
    .from("homesearch_session")
    .select("id, created_at, other")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return null;
  }

  const sessionOther = parseSessionOther(session.other);

  const { data: queries, error: queriesError } = await supabase
    .from("homesearch_query")
    .select("id, created_at, session_id, query, results, other")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (queriesError) {
    console.error("getHomesearchSession queries failed:", queriesError);
    return {
      id: session.id,
      created_at: session.created_at,
      other: sessionOther,
      queries: [],
    };
  }

  const mapped = (queries ?? [])
    .map(mapQueryRow)
    .filter((row): row is HomesearchQueryRow => row != null)
    .filter((row) => !row.other.removed_at);

  return {
    id: session.id,
    created_at: session.created_at,
    other: sessionOther,
    queries: mapped,
  };
}
