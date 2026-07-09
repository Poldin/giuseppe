const GEMINI_MODEL = "gemini-3.1-flash-lite";

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY non configurata");
  }
  return apiKey;
}

function parseProductsJson(raw: string): string[] {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Risposta LLM non valida");
  }

  const parsed = JSON.parse(jsonMatch[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Risposta LLM non è un array");
  }

  return parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function extractProductsFromText(text: string): Promise<string[]> {
  const apiKey = getGeminiApiKey();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Sei un assistente per uno studio dentistico. Estrai dalla richiesta dell'utente una lista di prodotti odontoiatrici o materiali da cercare.

Regole:
- Rispondi SOLO con un JSON array di stringhe in italiano
- Ogni stringa deve essere un prodotto/materiali distinto e cercabile, meglio se preciso rispetto alle esigenze dell'utente
- Non aggiungere spiegazioni, markdown o altro testo
- Esempio: ["guanti in nitrile", "composito universale", "alginato"]

Richiesta utente:
${text}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Gemini non ha restituito prodotti");
  }

  console.log("[LLM] Risposta grezza:", rawText);

  const products = parseProductsJson(rawText);
  if (products.length === 0) {
    throw new Error("Nessun prodotto trovato nel testo");
  }

  console.log("[LLM] Prodotti estratti:", products);

  return products;
}
