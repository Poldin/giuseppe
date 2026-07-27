import type {
  AifaAtc,
  AifaCompany,
  AifaGroup,
  AifaIngredient,
  AifaMedicine,
  AifaRelease,
} from "@/app/lib/aifa/types";
import { SITE_NAME, SITE_URL, type FaqItem } from "@/app/lib/seo/site";

export function listaTrasparenzaPath(): string {
  return "/lista-trasparenza";
}
export function listaTrasparenzaAbsoluteUrl(): string {
  return `${SITE_URL}${listaTrasparenzaPath()}`;
}

export function equivalentiPath(slug: string): string {
  return `/equivalenti/${encodeURIComponent(slug)}`;
}
export function equivalentiAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${equivalentiPath(slug)}`;
}

export function principioAttivoPath(slug: string): string {
  return `/principio-attivo/${encodeURIComponent(slug)}`;
}
export function principioAttivoAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${principioAttivoPath(slug)}`;
}

export function farmacoPath(slug: string): string {
  return `/farmaco/${encodeURIComponent(slug)}`;
}
export function farmacoAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${farmacoPath(slug)}`;
}

export function atcPath(slug: string): string {
  return `/atc/${encodeURIComponent(slug)}`;
}
export function atcAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${atcPath(slug)}`;
}

export function dittaPath(slug: string): string {
  return `/ditta/${encodeURIComponent(slug)}`;
}
export function dittaAbsoluteUrl(slug: string): string {
  return `${SITE_URL}${dittaPath(slug)}`;
}

export function formatEuroIt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatAifaDateIt(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function equivalentiTitle(group: AifaGroup): string {
  const ingredient = group.ingredient?.name ?? "Equivalenti";
  const pack = group.reference_pack_label
    ? ` ${group.reference_pack_label}`
    : "";
  const base = `Equivalenti ${ingredient}${pack} (${group.code})`;
  return base.length > 60 ? `Equivalenti ${ingredient} — ${group.code}` : base;
}

export function equivalentiDescription(
  group: AifaGroup,
  medicines: AifaMedicine[],
  release: AifaRelease | null
): string {
  const ingredient = group.ingredient?.name ?? "principio attivo";
  const n = medicines.length;
  const cheapest = medicines[0];
  const date = formatAifaDateIt(release?.published_on);
  const priceBit = cheapest
    ? ` Il più conveniente: ${cheapest.name} a ${formatEuroIt(cheapest.prezzo_pubblico)}.`
    : "";
  return (
    `Confronto prezzi AIFA del gruppo di equivalenza ${group.code} (${ingredient}): ` +
    `${n} confezioni.${priceBit}` +
    (date ? ` Aggiornamento lista di trasparenza ${date}.` : "")
  ).slice(0, 160);
}

export function getEquivalentiFaq(
  group: AifaGroup,
  medicines: AifaMedicine[],
  release: AifaRelease | null
): FaqItem[] {
  const ingredient = group.ingredient?.name ?? "questo principio attivo";
  const date = formatAifaDateIt(release?.published_on) ?? "l’ultimo aggiornamento AIFA";
  const withDiff = medicines.filter((m) => (m.differenza ?? 0) > 0);
  const items: FaqItem[] = [
    {
      question: `Cosa significa il gruppo di equivalenza ${group.code}?`,
      answer:
        `È il codice AIFA che raggruppa i farmaci equivalenti con lo stesso principio attivo ` +
        `(${ingredient}) e la stessa confezione di riferimento` +
        (group.reference_pack_label ? ` (${group.reference_pack_label})` : "") +
        `. All’interno del gruppo il SSN rimborsa fino al prezzo di riferimento.`,
    },
    {
      question: `Da dove arrivano questi prezzi?`,
      answer:
        `Dalla Lista di trasparenza AIFA (farmaci equivalenti), aggiornata tipicamente intorno al 15 di ogni mese. ` +
        `Dati al ${date}. Giuseppe ripubblica i dati ufficiali per facilitarne la lettura; verifica sempre sul sito AIFA.`,
    },
  ];
  if (withDiff.length > 0) {
    const ex = withDiff[0];
    items.push({
      question: `Perché alcuni farmaci costano di più del prezzo di riferimento?`,
      answer:
        `Se il prezzo pubblico supera il prezzo di riferimento SSN, la differenza resta a carico del cittadino ` +
        `(es. ${ex.name}: ${formatEuroIt(ex.differenza)} in più). Scegliendo un equivalente al prezzo di riferimento, ` +
        `in genere non si paga la differenza.`,
    });
  }
  return items;
}

export function getEquivalentiJsonLd(
  group: AifaGroup,
  medicines: AifaMedicine[],
  release: AifaRelease | null
) {
  const url = equivalentiAbsoluteUrl(group.slug);
  const title = equivalentiTitle(group);
  const description = equivalentiDescription(group, medicines, release);
  const faq = getEquivalentiFaq(group, medicines, release);
  const dateModified = release?.published_on
    ? `${release.published_on}T00:00:00+02:00`
    : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        ...(dateModified ? { dateModified } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
          {
            "@type": "ListItem",
            position: 2,
            name: "Lista di trasparenza AIFA",
            item: listaTrasparenzaAbsoluteUrl(),
          },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export function principioTitle(ingredient: AifaIngredient): string {
  return `${ingredient.name}: equivalenti e prezzi AIFA`;
}

export function farmacoTitle(medicine: AifaMedicine): string {
  return `${medicine.name} — prezzo e equivalenti AIFA (AIC ${medicine.aic})`;
}

export function farmacoDescription(
  medicine: AifaMedicine,
  release: AifaRelease | null
): string {
  const date = formatAifaDateIt(release?.published_on);
  const group = medicine.group?.code;
  return (
    `${medicine.name} (AIC ${medicine.aic}): prezzo pubblico ${formatEuroIt(medicine.prezzo_pubblico)}, ` +
    `riferimento SSN ${formatEuroIt(medicine.prezzo_riferimento_ssn)}` +
    (medicine.differenza && medicine.differenza > 0
      ? `, differenza ${formatEuroIt(medicine.differenza)}`
      : "") +
    (group ? `. Gruppo ${group}.` : ".") +
    (date ? ` Dati AIFA al ${date}.` : "")
  ).slice(0, 160);
}

export function getFarmacoJsonLd(
  medicine: AifaMedicine,
  release: AifaRelease | null
) {
  const url = farmacoAbsoluteUrl(medicine.slug);
  const title = farmacoTitle(medicine);
  const description = farmacoDescription(medicine, release);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        url,
        name: title,
        description,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "Drug",
        name: medicine.name,
        identifier: medicine.aic,
        ...(medicine.ingredient
          ? { activeIngredient: medicine.ingredient.name }
          : {}),
        ...(medicine.prezzo_pubblico != null
          ? {
              offers: {
                "@type": "Offer",
                price: medicine.prezzo_pubblico,
                priceCurrency: "EUR",
              },
            }
          : {}),
      },
    ],
  };
}

export function atcTitle(atc: AifaAtc): string {
  return `ATC ${atc.code}: gruppi di equivalenza AIFA`;
}

export function dittaTitle(company: AifaCompany): string {
  return `${company.name}: farmaci in lista di trasparenza AIFA`;
}
