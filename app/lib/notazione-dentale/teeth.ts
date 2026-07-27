/** Permanent dentition — FDI / Universal / Palmer mapping (static, no DB). */

export type ToothRecord = {
  fdi: string;
  universal: string;
  palmer_numero: number;
  palmer_simbolo: string;
  quadrante_id: 1 | 2 | 3 | 4;
  quadrante_nome: string;
  nome_anatomico: string;
  is_dente_giudizio: boolean;
  slug: string;
};

export const TEETH: readonly ToothRecord[] = [
  {
    fdi: "18",
    universal: "1",
    palmer_numero: 8,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Terzo molare superiore destro",
    is_dente_giudizio: true,
    slug: "dente-fdi-18",
  },
  {
    fdi: "17",
    universal: "2",
    palmer_numero: 7,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Secondo molare superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-17",
  },
  {
    fdi: "16",
    universal: "3",
    palmer_numero: 6,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Primo molare superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-16",
  },
  {
    fdi: "15",
    universal: "4",
    palmer_numero: 5,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Secondo premolare superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-15",
  },
  {
    fdi: "14",
    universal: "5",
    palmer_numero: 4,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Primo premolare superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-14",
  },
  {
    fdi: "13",
    universal: "6",
    palmer_numero: 3,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Canino superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-13",
  },
  {
    fdi: "12",
    universal: "7",
    palmer_numero: 2,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Incisivo laterale superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-12",
  },
  {
    fdi: "11",
    universal: "8",
    palmer_numero: 1,
    palmer_simbolo: "┘",
    quadrante_id: 1,
    quadrante_nome: "Superiore Destro",
    nome_anatomico: "Incisivo centrale superiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-11",
  },
  {
    fdi: "21",
    universal: "9",
    palmer_numero: 1,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Incisivo centrale superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-21",
  },
  {
    fdi: "22",
    universal: "10",
    palmer_numero: 2,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Incisivo laterale superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-22",
  },
  {
    fdi: "23",
    universal: "11",
    palmer_numero: 3,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Canino superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-23",
  },
  {
    fdi: "24",
    universal: "12",
    palmer_numero: 4,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Primo premolare superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-24",
  },
  {
    fdi: "25",
    universal: "13",
    palmer_numero: 5,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Secondo premolare superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-25",
  },
  {
    fdi: "26",
    universal: "14",
    palmer_numero: 6,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Primo molare superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-26",
  },
  {
    fdi: "27",
    universal: "15",
    palmer_numero: 7,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Secondo molare superiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-27",
  },
  {
    fdi: "28",
    universal: "16",
    palmer_numero: 8,
    palmer_simbolo: "└",
    quadrante_id: 2,
    quadrante_nome: "Superiore Sinistro",
    nome_anatomico: "Terzo molare superiore sinistro",
    is_dente_giudizio: true,
    slug: "dente-fdi-28",
  },
  {
    fdi: "38",
    universal: "17",
    palmer_numero: 8,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Terzo molare inferiore sinistro",
    is_dente_giudizio: true,
    slug: "dente-fdi-38",
  },
  {
    fdi: "37",
    universal: "18",
    palmer_numero: 7,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Secondo molare inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-37",
  },
  {
    fdi: "36",
    universal: "19",
    palmer_numero: 6,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Primo molare inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-36",
  },
  {
    fdi: "35",
    universal: "20",
    palmer_numero: 5,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Secondo premolare inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-35",
  },
  {
    fdi: "34",
    universal: "21",
    palmer_numero: 4,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Primo premolare inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-34",
  },
  {
    fdi: "33",
    universal: "22",
    palmer_numero: 3,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Canino inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-33",
  },
  {
    fdi: "32",
    universal: "23",
    palmer_numero: 2,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Incisivo laterale inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-32",
  },
  {
    fdi: "31",
    universal: "24",
    palmer_numero: 1,
    palmer_simbolo: "┌",
    quadrante_id: 3,
    quadrante_nome: "Inferiore Sinistro",
    nome_anatomico: "Incisivo centrale inferiore sinistro",
    is_dente_giudizio: false,
    slug: "dente-fdi-31",
  },
  {
    fdi: "41",
    universal: "25",
    palmer_numero: 1,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Incisivo centrale inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-41",
  },
  {
    fdi: "42",
    universal: "26",
    palmer_numero: 2,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Incisivo laterale inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-42",
  },
  {
    fdi: "43",
    universal: "27",
    palmer_numero: 3,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Canino inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-43",
  },
  {
    fdi: "44",
    universal: "28",
    palmer_numero: 4,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Primo premolare inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-44",
  },
  {
    fdi: "45",
    universal: "29",
    palmer_numero: 5,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Secondo premolare inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-45",
  },
  {
    fdi: "46",
    universal: "30",
    palmer_numero: 6,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Primo molare inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-46",
  },
  {
    fdi: "47",
    universal: "31",
    palmer_numero: 7,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Secondo molare inferiore destro",
    is_dente_giudizio: false,
    slug: "dente-fdi-47",
  },
  {
    fdi: "48",
    universal: "32",
    palmer_numero: 8,
    palmer_simbolo: "┐",
    quadrante_id: 4,
    quadrante_nome: "Inferiore Destro",
    nome_anatomico: "Terzo molare inferiore destro",
    is_dente_giudizio: true,
    slug: "dente-fdi-48",
  },
] as const;

const bySlug = new Map(TEETH.map((t) => [t.slug, t]));
const byFdi = new Map(TEETH.map((t) => [t.fdi, t]));

export function getAllTeeth(): readonly ToothRecord[] {
  return TEETH;
}

export function getToothBySlug(slug: string): ToothRecord | undefined {
  const key = decodeURIComponent(slug).trim().toLowerCase();
  return bySlug.get(key);
}

export function getToothByFdi(fdi: string): ToothRecord | undefined {
  return byFdi.get(fdi.trim());
}

export function palmerNotation(tooth: ToothRecord): string {
  return `${tooth.palmer_simbolo}${tooth.palmer_numero}`;
}

/** Other teeth in the same quadrant, excluding `tooth` (for internal links). */
export function getSiblingTeeth(tooth: ToothRecord): ToothRecord[] {
  return TEETH.filter(
    (t) => t.quadrante_id === tooth.quadrante_id && t.slug !== tooth.slug
  );
}

export function teethGroupedByQuadrant(): {
  id: ToothRecord["quadrante_id"];
  nome: string;
  teeth: ToothRecord[];
}[] {
  const order: ToothRecord["quadrante_id"][] = [1, 2, 3, 4];
  return order.map((id) => {
    const teeth = TEETH.filter((t) => t.quadrante_id === id);
    return {
      id,
      nome: teeth[0]?.quadrante_nome ?? `Quadrante ${id}`,
      teeth: [...teeth],
    };
  });
}
