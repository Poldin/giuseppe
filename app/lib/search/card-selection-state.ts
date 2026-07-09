import type {
  EcommerceInfo,
  ProdottoOfferta,
  RigaTopMatch,
  RisultatoConfronto,
  UserCardStateMap,
  UserCardUiState,
} from "@/app/lib/search/elabora-scenari-types";
import type { SelezioneUtente } from "@/app/lib/search/elabora-scenari-types";
import { buildSelezioneUtente } from "@/app/lib/search/elabora-confronto-utente";

export type CardMeta = {
  key: string;
  queryIndex: number;
  ecommerceId: string;
  offerta: ProdottoOfferta;
};

export type CardUiState = UserCardUiState;

export type CardStateMap = UserCardStateMap;

export function buildCardKey(
  queryIndex: number,
  ecommerceId: string,
  offertaId: string
): string {
  return `${queryIndex}-${ecommerceId}-${offertaId}`;
}

export function parseCardKey(
  key: string
): { queryIndex: number; ecommerceId: string; offertaId: string } | null {
  const firstDash = key.indexOf("-");
  if (firstDash <= 0) {
    return null;
  }

  const queryIndex = Number.parseInt(key.slice(0, firstDash), 10);
  if (!Number.isFinite(queryIndex)) {
    return null;
  }

  const rest = key.slice(firstDash + 1);
  if (rest.length < 73 || rest[36] !== "-") {
    return null;
  }

  const ecommerceId = rest.slice(0, 36);
  const offertaId = rest.slice(37);
  if (offertaId.length !== 36) {
    return null;
  }

  return { queryIndex, ecommerceId, offertaId };
}

function isValidCardUiState(value: unknown): value is CardUiState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const ui = value as Partial<CardUiState>;
  return (
    typeof ui.hidden === "boolean" &&
    typeof ui.selected === "boolean" &&
    typeof ui.quantity === "number" &&
    Number.isFinite(ui.quantity) &&
    ui.quantity >= 1
  );
}

function normalizeSelectionPerSlot(
  cards: CardMeta[],
  state: CardStateMap,
  defaultState: CardStateMap
): CardStateMap {
  const next = { ...state };
  const slots = new Map<string, string[]>();

  for (const card of cards) {
    const slotKey = `${card.queryIndex}:${card.ecommerceId}`;
    slots.set(slotKey, [...(slots.get(slotKey) ?? []), card.key]);
  }

  for (const keys of slots.values()) {
    const selectedKeys = keys.filter((key) => next[key]?.selected);
    if (selectedKeys.length > 1) {
      for (const key of selectedKeys.slice(1)) {
        next[key] = { ...next[key], selected: false };
      }
      continue;
    }

    if (selectedKeys.length === 0 && keys.length > 0) {
      const fallbackKey =
        keys.find((key) => defaultState[key]?.selected) ?? keys[0];
      next[fallbackKey] = {
        ...(next[fallbackKey] ?? defaultState[fallbackKey] ?? {
          hidden: false,
          selected: false,
          quantity: 1,
        }),
        selected: true,
      };
    }
  }

  return next;
}

export function mergeCardStateWithSaved(
  cards: CardMeta[],
  defaultState: CardStateMap,
  saved?: CardStateMap | null
): CardStateMap {
  if (!saved) {
    return defaultState;
  }

  const cardKeys = new Set(cards.map((card) => card.key));
  const merged = { ...defaultState };

  for (const [key, ui] of Object.entries(saved)) {
    if (!cardKeys.has(key) || !isValidCardUiState(ui)) {
      continue;
    }

    merged[key] = {
      hidden: ui.hidden,
      selected: ui.selected,
      quantity: Math.max(1, Math.floor(ui.quantity)),
    };
  }

  return normalizeSelectionPerSlot(cards, merged, defaultState);
}

export function sanitizeCardStateForSave(
  cardState: CardStateMap,
  cards: CardMeta[]
): CardStateMap {
  const cardKeys = new Set(cards.map((card) => card.key));
  const sanitized: CardStateMap = {};

  for (const [key, ui] of Object.entries(cardState)) {
    if (!cardKeys.has(key) || !isValidCardUiState(ui)) {
      continue;
    }

    sanitized[key] = {
      hidden: ui.hidden,
      selected: ui.selected,
      quantity: Math.max(1, Math.floor(ui.quantity)),
    };
  }

  return sanitized;
}

export function shiftUserCardStateAfterInsert(
  saved: CardStateMap | undefined,
  insertAfterIndex: number
): CardStateMap | undefined {
  if (!saved) {
    return undefined;
  }

  const threshold = insertAfterIndex + 1;
  const next: CardStateMap = {};

  for (const [key, ui] of Object.entries(saved)) {
    const parsed = parseCardKey(key);
    if (!parsed) {
      continue;
    }

    const queryIndex =
      parsed.queryIndex >= threshold ? parsed.queryIndex + 1 : parsed.queryIndex;
    const newKey = buildCardKey(
      queryIndex,
      parsed.ecommerceId,
      parsed.offertaId
    );
    next[newKey] = ui;
  }

  return next;
}

export function removeUserCardStateForReferenza(
  saved: CardStateMap | undefined,
  queryIndex: number
): CardStateMap | undefined {
  if (!saved) {
    return undefined;
  }

  const next: CardStateMap = {};

  for (const [key, ui] of Object.entries(saved)) {
    const parsed = parseCardKey(key);
    if (!parsed) {
      continue;
    }

    if (parsed.queryIndex === queryIndex) {
      continue;
    }

    const newQueryIndex =
      parsed.queryIndex > queryIndex ? parsed.queryIndex - 1 : parsed.queryIndex;
    const newKey = buildCardKey(
      newQueryIndex,
      parsed.ecommerceId,
      parsed.offertaId
    );
    next[newKey] = ui;
  }

  return next;
}

export function parseCardStatePayload(value: unknown): CardStateMap | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const parsed: CardStateMap = {};

  for (const [key, ui] of Object.entries(value)) {
    if (!isValidCardUiState(ui)) {
      continue;
    }

    parsed[key] = {
      hidden: ui.hidden,
      selected: ui.selected,
      quantity: Math.max(1, Math.floor(ui.quantity)),
    };
  }

  return parsed;
}

export function buildInitialCardState(confronto: RisultatoConfronto): {
  cards: CardMeta[];
  state: CardStateMap;
} {
  const cards: CardMeta[] = [];
  const state: CardStateMap = {};
  const selectedPerSlot = new Set<string>();

  for (const row of confronto.top_match_per_referenza ?? []) {
    for (const entry of row.per_ecommerce) {
      for (const [index, candidato] of entry.candidati.entries()) {
        const key = buildCardKey(row.query_index, entry.ecommerce_id, candidato.id);
        cards.push({
          key,
          queryIndex: row.query_index,
          ecommerceId: entry.ecommerce_id,
          offerta: candidato,
        });

        const slotKey = `${row.query_index}:${entry.ecommerce_id}`;
        const isDefaultSelected = index === 0 && !selectedPerSlot.has(slotKey);

        if (isDefaultSelected) {
          selectedPerSlot.add(slotKey);
        }

        state[key] = {
          hidden: false,
          selected: isDefaultSelected,
          quantity: 1,
        };
      }
    }
  }

  return { cards, state };
}

export function toggleCardSelected(
  state: CardStateMap,
  card: CardMeta,
  cards: CardMeta[]
): CardStateMap {
  const next = { ...state };
  const current = next[card.key] ?? {
    hidden: false,
    selected: false,
    quantity: 1,
  };
  const willSelect = !current.selected;

  if (willSelect) {
    for (const other of cards) {
      if (
        other.queryIndex === card.queryIndex &&
        other.ecommerceId === card.ecommerceId &&
        other.key !== card.key
      ) {
        next[other.key] = {
          ...(next[other.key] ?? { hidden: false, selected: false, quantity: 1 }),
          selected: false,
        };
      }
    }
  }

  next[card.key] = {
    ...current,
    selected: willSelect,
  };

  return next;
}

export function buildSelezioneFromState(
  cards: CardMeta[],
  state: CardStateMap
): SelezioneUtente[] {
  const selezioni: SelezioneUtente[] = [];

  for (const card of cards) {
    const ui = state[card.key];
    if (!ui || ui.hidden) continue;

    const sel = buildSelezioneUtente({
      cardKey: card.key,
      queryIndex: card.queryIndex,
      ecommerceId: card.ecommerceId,
      offerta: card.offerta,
      quantita: ui.quantity,
      selezionato: ui.selected,
    });

    if (sel) selezioni.push(sel);
  }

  return selezioni;
}

export function catalogFromConfronto(
  confronto: RisultatoConfronto
): EcommerceInfo[] {
  if (confronto.catalogo_ecommerce?.length) {
    return confronto.catalogo_ecommerce;
  }

  return confronto.tabelle_ecommerce.map((t) => ({
    id: t.ecommerce_id,
    name: t.ecommerce_name,
    logo_url: t.logo_url,
    domain: t.domain,
    shipping_tiers: [],
  }));
}

export function buildCardStateForRow(row: RigaTopMatch): {
  cards: CardMeta[];
  state: CardStateMap;
} {
  const cards: CardMeta[] = [];
  const state: CardStateMap = {};
  const selectedPerSlot = new Set<string>();

  for (const entry of row.per_ecommerce) {
    for (const [index, candidato] of entry.candidati.entries()) {
      const key = buildCardKey(row.query_index, entry.ecommerce_id, candidato.id);
      cards.push({
        key,
        queryIndex: row.query_index,
        ecommerceId: entry.ecommerce_id,
        offerta: candidato,
      });

      const slotKey = `${row.query_index}:${entry.ecommerce_id}`;
      const isDefaultSelected = index === 0 && !selectedPerSlot.has(slotKey);

      if (isDefaultSelected) {
        selectedPerSlot.add(slotKey);
      }

      state[key] = {
        hidden: false,
        selected: isDefaultSelected,
        quantity: 1,
      };
    }
  }

  return { cards, state };
}

export function shiftCardsAfterInsert(
  cards: CardMeta[],
  cardState: CardStateMap,
  insertAfterIndex: number
): { cards: CardMeta[]; state: CardStateMap } {
  const threshold = insertAfterIndex + 1;
  const nextCards: CardMeta[] = [];
  const nextState: CardStateMap = {};

  for (const card of cards) {
    const newQueryIndex =
      card.queryIndex >= threshold ? card.queryIndex + 1 : card.queryIndex;
    const newKey = buildCardKey(newQueryIndex, card.ecommerceId, card.offerta.id);

    nextCards.push({
      ...card,
      queryIndex: newQueryIndex,
      key: newKey,
    });

    nextState[newKey] = cardState[card.key] ?? {
      hidden: false,
      selected: false,
      quantity: 1,
    };
  }

  return { cards: nextCards, state: nextState };
}

export function mergeCardStateAfterInsert(
  existingCards: CardMeta[],
  existingState: CardStateMap,
  insertAfterIndex: number,
  newRow: RigaTopMatch
): { cards: CardMeta[]; state: CardStateMap } {
  const shifted = shiftCardsAfterInsert(
    existingCards,
    existingState,
    insertAfterIndex
  );
  const inserted = buildCardStateForRow(newRow);

  return {
    cards: [...shifted.cards, ...inserted.cards],
    state: { ...shifted.state, ...inserted.state },
  };
}

export function removeCardStateForReferenza(
  cards: CardMeta[],
  cardState: CardStateMap,
  queryIndex: number
): { cards: CardMeta[]; state: CardStateMap } {
  const nextCards: CardMeta[] = [];
  const nextState: CardStateMap = {};

  for (const card of cards) {
    if (card.queryIndex === queryIndex) {
      continue;
    }

    const newQueryIndex =
      card.queryIndex > queryIndex ? card.queryIndex - 1 : card.queryIndex;
    const newKey = buildCardKey(newQueryIndex, card.ecommerceId, card.offerta.id);

    nextCards.push({
      ...card,
      queryIndex: newQueryIndex,
      key: newKey,
    });

    nextState[newKey] = cardState[card.key] ?? {
      hidden: false,
      selected: false,
      quantity: 1,
    };
  }

  return { cards: nextCards, state: nextState };
}
