/** Canonical public site — used by metadata, robots, sitemap, JSON-LD. */
export const SITE_URL = "https://giuseppeacquisti.it";
export const SITE_NAME = "Giuseppe";
export const SITE_EMAIL = "info@giuseppeacquisti.it";

/** Ecommerce attualmente confrontati. */
export const COMPARED_ECOMMERCES = ["Gerhò", "Dontalia", "Dentaltix"] as const;

/**
 * Trasparenza su freschezza dati e IVA — stesso testo in home, FAQ e JSON-LD.
 * Nessun riferimento a scraping o termini tecnici di raccolta dati.
 */
export const PRICE_TRANSPARENCY =
  "I prezzi e i prodotti mostrati si basano su un catalogo aggiornato quotidianamente da Gerhò, Dontalia e Dentaltix. Il confronto usa dati di catalogo aggiornati ogni giorno; il prezzo finale e l’IVA vanno sempre verificati sul sito del rivenditore al momento dell’acquisto.";

/**
 * Descrizione del servizio per crawler e AI.
 * Deve restare allineata a ciò che Giuseppe fa davvero in prodotto.
 */
export const SITE_DESCRIPTION =
  "Giuseppe è un servizio gratuito di confronto prezzi e prodotti per studi dentistici. Indichi i materiali e i consumabili che ti servono: Giuseppe cerca tra oltre 100.000 articoli e, ad oggi, confronta prodotti da Gerhò, Dontalia e Dentaltix. I prezzi e i prodotti mostrati si basano su un catalogo aggiornato quotidianamente; il prezzo finale e l’IVA vanno sempre verificati sul sito del rivenditore al momento dell’acquisto. Riceve dalle 500 alle 2.000 richieste giornaliere di comparazione, con un tempo medio di confronto tra 2,3 e 4,9 secondi. Come funziona: 1) indica la lista dei prodotti che ti servono in studio; 2) Giuseppe ricerca sui principali rivenditori e mostra le migliori offerte; 3) selezioni i prodotti migliori per ogni esigenza e componi l'ordine migliore; 4) acquisti in tutta sicurezza direttamente dai rivenditori. Contatto: info@giuseppeacquisti.it.";

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

/** FAQ homepage — stesso testo visibile agli utenti e nel JSON-LD FAQPage. */
export const FAQ_ITEMS = [
  {
    question: "Cos’è Giuseppe?",
    answer:
      "Giuseppe è un servizio gratuito di confronto prezzi e prodotti per studi dentistici. Indichi i materiali e i consumabili che ti servono e Giuseppe confronta le offerte sui principali ecommerce dentali, aiutandoti a scegliere la combinazione migliore. L’acquisto avviene direttamente presso i rivenditori.",
  },
  {
    question: "Quali ecommerce confronta oggi Giuseppe?",
    answer:
      "Ad oggi Giuseppe confronta prodotti da Gerhò, Dontalia e Dentaltix, su un catalogo di oltre 100.000 articoli disponibili.",
  },
  {
    question: "I prezzi sono aggiornati? Includono l’IVA?",
    answer: PRICE_TRANSPARENCY,
  },
  {
    question: "Giuseppe è gratis?",
    answer: "Sì. Giuseppe è un servizio gratuito per gli studi dentistici.",
  },
  {
    question: "Come funziona il confronto?",
    answer:
      "1) Indichi la lista dei prodotti che ti servono in studio. 2) Giuseppe ricerca sui principali rivenditori e ti mostra le migliori offerte. 3) Selezioni i prodotti migliori per ogni esigenza e componi l’ordine migliore. 4) Acquisti in tutta sicurezza direttamente dai rivenditori.",
  },
  {
    question: "Quanto tempo ci vuole per una comparazione?",
    answer:
      "Il tempo medio di comparazione va dai 2,3 ai 4,9 secondi. Giuseppe riceve dalle 500 alle 2.000 richieste giornaliere di comparazione.",
  },
  {
    question: "Giuseppe vende i prodotti?",
    answer:
      "No: Giuseppe confronta e ti porta ai rivenditori; non vende e non gestisce il pagamento.",
  },
  {
    question: "Come posso contattarvi?",
    answer: "Puoi scriverci a info@giuseppeacquisti.it.",
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
          "Catalogo aggiornato quotidianamente",
          "Prezzo finale e IVA da verificare sul sito del rivenditore all’acquisto",
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
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
