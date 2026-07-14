import type {
  CommittedAssignment,
  EcommerceInfo,
  PendingRowChange,
  ScenarioCarrello,
  SelezioneUtente,
} from "@/app/lib/search/elabora-scenari-types";
import { buildMatriceFromSelezione } from "@/app/lib/search/elabora-confronto-utente";
import {
  buildShippingTiersMap,
  spedizioneOrdini,
} from "@/app/lib/search/shipping-cost";

function isValidAssignment(value: unknown): value is CommittedAssignment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const assignment = value as Partial<CommittedAssignment>;
  return (
    typeof assignment.query_index === "number" &&
    Number.isInteger(assignment.query_index) &&
    assignment.query_index >= 0 &&
    typeof assignment.ecommerce_id === "string" &&
    assignment.ecommerce_id.length > 0 &&
    typeof assignment.offerta_id === "string" &&
    assignment.offerta_id.length > 0 &&
    typeof assignment.quantita === "number" &&
    Number.isFinite(assignment.quantita) &&
    assignment.quantita >= 1
  );
}

export function parseCommittedScenarioPayload(
  value: unknown
): CommittedAssignment[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: CommittedAssignment[] = [];

  for (const item of value) {
    if (!isValidAssignment(item)) {
      continue;
    }

    parsed.push({
      query_index: item.query_index,
      ecommerce_id: item.ecommerce_id,
      offerta_id: item.offerta_id,
      quantita: Math.max(1, Math.floor(item.quantita)),
    });
  }

  return parsed.length > 0 ? parsed : null;
}

export function sanitizeCommittedScenarioForSave(
  assignments: CommittedAssignment[]
): CommittedAssignment[] {
  const seen = new Set<number>();
  const sanitized: CommittedAssignment[] = [];

  for (const assignment of [...assignments].sort(
    (a, b) => a.query_index - b.query_index
  )) {
    if (seen.has(assignment.query_index)) {
      continue;
    }

    seen.add(assignment.query_index);
    sanitized.push({
      query_index: assignment.query_index,
      ecommerce_id: assignment.ecommerce_id,
      offerta_id: assignment.offerta_id,
      quantita: Math.max(1, Math.floor(assignment.quantita)),
    });
  }

  return sanitized;
}

export function shiftCommittedAfterInsert(
  assignments: CommittedAssignment[],
  insertAfterIndex: number
): CommittedAssignment[] {
  const threshold = insertAfterIndex + 1;

  return assignments.map((assignment) => ({
    ...assignment,
    query_index:
      assignment.query_index >= threshold
        ? assignment.query_index + 1
        : assignment.query_index,
  }));
}

export function removeCommittedForReferenza(
  assignments: CommittedAssignment[],
  queryIndex: number
): CommittedAssignment[] {
  return assignments
    .filter((assignment) => assignment.query_index !== queryIndex)
    .map((assignment) => ({
      ...assignment,
      query_index:
        assignment.query_index > queryIndex
          ? assignment.query_index - 1
          : assignment.query_index,
    }));
}

export function assignmentsFromScenario(
  scenario: ScenarioCarrello,
  queryIndexByOffertaId: Map<string, number>
): CommittedAssignment[] {
  const assignments: CommittedAssignment[] = [];

  for (const [ecommerce_id, voci] of Object.entries(scenario.ordini)) {
    for (const voce of voci) {
      const query_index = queryIndexByOffertaId.get(voce.offerta.id);
      if (query_index == null) {
        continue;
      }

      assignments.push({
        query_index,
        ecommerce_id,
        offerta_id: voce.offerta.id,
        quantita: voce.quantita,
      });
    }
  }

  return sanitizeCommittedScenarioForSave(assignments);
}

export function buildScenarioFromAssignments(
  assignments: CommittedAssignment[],
  input: {
    prodottiRichiesti: string[];
    selezioni: SelezioneUtente[];
    catalogoEcommerce: EcommerceInfo[];
  }
): ScenarioCarrello {
  const matrice = buildMatriceFromSelezione(input.selezioni);
  const tiersByEcommerce = buildShippingTiersMap(input.catalogoEcommerce);
  const n = input.prodottiRichiesti.length;
  const ordini: ScenarioCarrello["ordini"] = {};
  const mancanti: number[] = [];
  let prezzo_prodotti = 0;
  let copertura = 0;

  const assignmentByIndex = new Map(
    assignments.map((assignment) => [assignment.query_index, assignment])
  );

  for (let idx = 0; idx < n; idx += 1) {
    const assignment = assignmentByIndex.get(idx);
    if (!assignment) {
      mancanti.push(idx);
      continue;
    }

    const voce = matrice.get(idx)?.get(assignment.ecommerce_id);
    if (
      !voce ||
      voce.offerta.id !== assignment.offerta_id ||
      !voce.disponibile
    ) {
      mancanti.push(idx);
      continue;
    }

    const quantita = Math.max(1, assignment.quantita);
    const updatedVoce = {
      offerta: voce.offerta,
      quantita,
      prezzo_riga: voce.offerta.prezzo * quantita,
      disponibile: voce.disponibile,
    };

    ordini[assignment.ecommerce_id] = [
      ...(ordini[assignment.ecommerce_id] ?? []),
      updatedVoce,
    ];
    prezzo_prodotti += updatedVoce.prezzo_riga;
    copertura += 1;
  }

  const prezzo_spedizione = spedizioneOrdini(ordini, tiersByEcommerce);

  return {
    titolo: "💸Risparmio assoluto",
    prezzo_prodotti,
    prezzo_spedizione,
    prezzo_totale: prezzo_prodotti + prezzo_spedizione,
    copertura,
    copertura_totale: n,
    ordini,
    prodotti_mancanti_indices: mancanti,
  };
}

function lookupEcommerceName(
  ecommerceId: string,
  catalogoEcommerce: EcommerceInfo[]
): string {
  return (
    catalogoEcommerce.find((entry) => entry.id === ecommerceId)?.name ??
    ecommerceId
  );
}

function assignmentMapFromScenario(
  scenario: ScenarioCarrello,
  queryIndexByOffertaId: Map<string, number>
): Map<number, CommittedAssignment> {
  const map = new Map<number, CommittedAssignment>();

  for (const [ecommerce_id, voci] of Object.entries(scenario.ordini)) {
    for (const voce of voci) {
      const query_index = queryIndexByOffertaId.get(voce.offerta.id);
      if (query_index == null) {
        continue;
      }

      map.set(query_index, {
        query_index,
        ecommerce_id,
        offerta_id: voce.offerta.id,
        quantita: voce.quantita,
      });
    }
  }

  return map;
}

function assignmentsEqual(
  left: CommittedAssignment | null | undefined,
  right: CommittedAssignment | null | undefined
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.ecommerce_id === right.ecommerce_id &&
    left.offerta_id === right.offerta_id &&
    left.quantita === right.quantita
  );
}

export function computePendingChanges(input: {
  committedAssignments: CommittedAssignment[];
  committedScenario: ScenarioCarrello;
  optimalScenario: ScenarioCarrello;
  prodottiRichiesti: string[];
  catalogoEcommerce: EcommerceInfo[];
  queryIndexByOffertaId: Map<string, number>;
}): { changes: PendingRowChange[]; savingsDelta: number } {
  const committedMap = new Map(
    input.committedAssignments.map((assignment) => [
      assignment.query_index,
      assignment,
    ])
  );
  const optimalMap = assignmentMapFromScenario(
    input.optimalScenario,
    input.queryIndexByOffertaId
  );
  const committedDisplayMap = assignmentMapFromScenario(
    input.committedScenario,
    input.queryIndexByOffertaId
  );
  const changes: PendingRowChange[] = [];

  for (let queryIndex = 0; queryIndex < input.prodottiRichiesti.length; queryIndex += 1) {
    const committedAssignment = committedMap.get(queryIndex) ?? null;
    const optimalAssignment = optimalMap.get(queryIndex) ?? null;

    if (assignmentsEqual(committedAssignment, optimalAssignment)) {
      continue;
    }

    if (!optimalAssignment) {
      continue;
    }

    const committedDisplay = committedDisplayMap.get(queryIndex) ?? null;
    const optimalVoce = input.optimalScenario.ordini[optimalAssignment.ecommerce_id]?.find(
      (voce) => voce.offerta.id === optimalAssignment.offerta_id
    );

    if (!optimalVoce) {
      continue;
    }

    changes.push({
      queryIndex,
      queryText: input.prodottiRichiesti[queryIndex] ?? `Referenza ${queryIndex + 1}`,
      committed: committedDisplay
        ? {
            ecommerceId: committedDisplay.ecommerce_id,
            ecommerceName: lookupEcommerceName(
              committedDisplay.ecommerce_id,
              input.catalogoEcommerce
            ),
            productName:
              input.committedScenario.ordini[committedDisplay.ecommerce_id]?.find(
                (voce) => voce.offerta.id === committedDisplay.offerta_id
              )?.offerta.product_name ?? "—",
            quantita: committedDisplay.quantita,
          }
        : null,
      optimal: {
        ecommerceId: optimalAssignment.ecommerce_id,
        ecommerceName: lookupEcommerceName(
          optimalAssignment.ecommerce_id,
          input.catalogoEcommerce
        ),
        productName: optimalVoce.offerta.product_name,
        quantita: optimalAssignment.quantita,
      },
    });
  }

  const savingsDelta =
    input.committedScenario.prezzo_totale - input.optimalScenario.prezzo_totale;

  return { changes, savingsDelta };
}

export function updateCommittedQuantity(
  assignments: CommittedAssignment[],
  queryIndex: number,
  quantita: number
): CommittedAssignment[] {
  const nextQuantity = Math.max(1, Math.floor(quantita));
  let found = false;

  const next = assignments.map((assignment) => {
    if (assignment.query_index !== queryIndex) {
      return assignment;
    }

    found = true;
    return { ...assignment, quantita: nextQuantity };
  });

  return found ? next : assignments;
}

export function upsertCommittedAssignment(
  assignments: CommittedAssignment[],
  assignment: CommittedAssignment
): CommittedAssignment[] {
  const withoutCurrent = assignments.filter(
    (entry) => entry.query_index !== assignment.query_index
  );

  return sanitizeCommittedScenarioForSave([
    ...withoutCurrent,
    {
      ...assignment,
      quantita: Math.max(1, Math.floor(assignment.quantita)),
    },
  ]);
}

export function removeCommittedAssignment(
  assignments: CommittedAssignment[],
  queryIndex: number
): CommittedAssignment[] {
  return assignments.filter((assignment) => assignment.query_index !== queryIndex);
}

export function buildPendingFingerprint(
  changes: PendingRowChange[],
  savingsDelta: number
): string {
  const rows = changes
    .map(
      (change) =>
        `${change.queryIndex}:${change.optimal.ecommerceId}:${change.optimal.productName}:${change.optimal.quantita}`
    )
    .sort()
    .join("|");

  return `${savingsDelta.toFixed(2)}::${rows}`;
}

export function replaceCommittedWithOptimal(
  optimalScenario: ScenarioCarrello,
  queryIndexByOffertaId: Map<string, number>
): CommittedAssignment[] {
  return assignmentsFromScenario(optimalScenario, queryIndexByOffertaId);
}

export function filterCommittedAssignments(
  assignments: CommittedAssignment[],
  validOfferIds: Set<string>,
  maxQueryIndex: number
): CommittedAssignment[] {
  return sanitizeCommittedScenarioForSave(
    assignments.filter(
      (assignment) =>
        assignment.query_index <= maxQueryIndex &&
        validOfferIds.has(assignment.offerta_id)
    )
  );
}
