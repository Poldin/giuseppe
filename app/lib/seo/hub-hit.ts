export type SeoHubHit = {
  href: string;
  title: string;
  eyebrow?: string | null;
  hint?: string | null;
};

export type SeoHubKind =
  | "pub"
  | "vs"
  | "recall"
  | "medical_device"
  | "categorie"
  | "docs";
