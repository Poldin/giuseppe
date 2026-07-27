export type AifaRelease = {
  id: string;
  published_on: string;
  row_count: number | null;
};

export type AifaIngredient = {
  id: string;
  name: string;
  slug: string;
};

export type AifaAtc = {
  id: string;
  code: string;
  slug: string;
};

export type AifaCompany = {
  id: string;
  name: string;
  slug: string;
};

export type AifaGroup = {
  id: string;
  code: string;
  slug: string;
  reference_pack_label: string | null;
  active_ingredient_id: string | null;
  atc_code_id: string | null;
  ingredient: AifaIngredient | null;
  atc: AifaAtc | null;
};

export type AifaMedicine = {
  id: string;
  aic: string;
  slug: string;
  name: string;
  pack_description: string | null;
  prezzo_riferimento_ssn: number | null;
  prezzo_pubblico: number | null;
  differenza: number | null;
  nota: string | null;
  is_active: boolean;
  updated_at: string | null;
  company: AifaCompany | null;
  ingredient: AifaIngredient | null;
  group: {
    id: string;
    code: string;
    slug: string;
    reference_pack_label: string | null;
  } | null;
  atc: AifaAtc | null;
};

export type AifaPriceHistoryPoint = {
  published_on: string;
  prezzo_riferimento_ssn: number | null;
  prezzo_pubblico: number | null;
  differenza: number | null;
  nota: string | null;
  equivalence_group_code: string | null;
};

export type AifaSitemapEntry = {
  slug: string;
  lastModified: Date | undefined;
};
