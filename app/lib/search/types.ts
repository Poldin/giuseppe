export type EcommerceSite = {
  name: string;
  url: string;
};

export type SearchHit = {
  title: string;
  description: string;
  url: string;
  content?: string;
};

/** @deprecated use SearchHit */
export type JinaSearchHit = SearchHit;

export type { RisultatoConfronto as ProductSearchConfronto } from "./elabora-scenari";

/** @deprecated sostituito da ProductSearchConfronto (ricerca Supabase trgm) */
export type ProductSearchResult = {
  product: string;
  platform: string;
  platformUrl: string;
  title: string;
  url: string;
  description: string;
};

export type ProductSearchChat = {
  id: string;
  created_at: string;
  query_text: string;
  products: string[];
  results: import("./elabora-scenari").RisultatoConfronto | ProductSearchResult[];
};
