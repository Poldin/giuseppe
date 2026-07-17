/** Canonical public site — used by metadata, robots, sitemap, JSON-LD. */
export const SITE_URL = "https://giuseppeacquisti.it";
export const SITE_NAME = "Giuseppe";
export const SITE_EMAIL = "info@giuseppeacquisti.it";

/** Ecommerce attualmente confrontati. */
export const COMPARED_ECOMMERCES = ["Gerhò", "Dontalia", "Dentaltix"] as const;

/**
 * Descrizione del servizio per crawler e AI.
 * Deve restare allineata a ciò che Giuseppe fa davvero in prodotto.
 */
export const SITE_DESCRIPTION =
  "Giuseppe è un servizio gratuito di confronto prezzi e prodotti per studi dentistici. Indichi i materiali e i consumabili che ti servono: Giuseppe cerca tra oltre 100.000 articoli e, ad oggi, confronta prodotti da Gerhò, Dontalia e Dentaltix. Riceve dalle 500 alle 2.000 richieste giornaliere di comparazione, con un tempo medio di confronto tra 2,3 e 4,9 secondi. Come funziona: 1) indica la lista dei prodotti che ti servono in studio; 2) Giuseppe ricerca sui principali rivenditori e mostra le migliori offerte; 3) selezioni i prodotti migliori per ogni esigenza e componi l'ordine migliore; 4) acquisti in tutta sicurezza direttamente dai rivenditori. Contatto: info@giuseppeacquisti.it.";

export const SITE_TITLE =
  "Giuseppe — Confronto prezzi e prodotti per studi dentistici";

export const SITE_KEYWORDS = [
  "Giuseppe",
  "confronto prezzi dentali",
  "materiali dentali",
  "ecommerce dentale",
  "studio dentistico",
  "acquisti studio dentistico",
  "comparatore prezzi odontoiatria",
  "consumabili dentali",
  "Gerhò",
  "Dontalia",
  "Dentaltix",
] as const;

/** Passi "Come funziona" allineati alla homepage. */
export const HOW_IT_WORKS_STEPS = [
  {
    title: "Cosa ti serve?",
    description: "indica la lista dei prodotti che ti servono in Studio.",
  },
  {
    title: "Lasciami comparare prezzi e prodotti",
    description:
      "Faccio una ricerca sui principali rivenditori e ti mostro le migliori offerte.",
  },
  {
    title: "Modifica e migliora la ricerca",
    description:
      "Seleziona i prodotti migliori per ogni tua esigenza e componi il tuo ordine migliore.",
  },
  {
    title: "Acquista in tutta sicurezza dai rivenditori.",
    description:
      "Io ti aiuto a a trovare la migliore combinazione di prodotti e prezzi: acquista in tutta sicurezza dai rivenditori.",
  },
] as const;

/** Structured data for AI / search engines (homepage). */
export function getHomeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "it-IT",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/giuseppe.jpeg`,
        description: SITE_DESCRIPTION,
        email: SITE_EMAIL,
        contactPoint: {
          "@type": "ContactPoint",
          email: SITE_EMAIL,
          contactType: "customer support",
          availableLanguage: "Italian",
        },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "it-IT",
        isAccessibleForFree: true,
        description: SITE_DESCRIPTION,
        audience: {
          "@type": "Audience",
          audienceType: "Studi dentistici",
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
          description: "Servizio gratuito per gli studi dentistici",
        },
        featureList: [
          "Confronto prezzi su oltre 100.000 articoli dentali",
          `Ad oggi confronta prodotti da ${COMPARED_ECOMMERCES.join(", ")}`,
          "Dalle 500 alle 2.000 richieste giornaliere di comparazione",
          "Tempo medio di comparazione tra 2,3 e 4,9 secondi",
          "Selezione e raffinamento dei prodotti per ogni referenza",
          "Combinazione ottimale di prodotti e prezzi",
          "Acquisto diretto presso i rivenditori",
          `Contatto: ${SITE_EMAIL}`,
        ],
      },
      {
        "@type": "HowTo",
        "@id": `${SITE_URL}/#how-to`,
        name: "Come funziona Giuseppe",
        description:
          "Come confrontare prezzi e prodotti dentali con Giuseppe in quattro passaggi.",
        inLanguage: "it-IT",
        step: HOW_IT_WORKS_STEPS.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.title,
          text: step.description,
        })),
      },
    ],
  };
}
