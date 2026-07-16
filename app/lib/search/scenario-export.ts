import { calcolaSpedizione, type ShippingTier } from "@/app/lib/search/shipping-cost";
import type {
  ScenarioCarrello,
  TabellaEcommerce,
} from "@/app/lib/search/elabora-scenari-types";

export type ScenarioExportLineItem = {
  productName: string;
  brand: string | null;
  quantity: number;
  unitPrice: number;
  linePrice: number;
  url: string | null;
};

export type ScenarioExportShop = {
  ecommerceId: string;
  ecommerceName: string;
  itemCount: number;
  coverageTotal: number;
  productsPrice: number;
  shippingPrice: number;
  totalPrice: number;
  items: ScenarioExportLineItem[];
};

export type ScenarioExportDocument = {
  title: string;
  coverage: number;
  coverageTotal: number;
  productsPrice: number;
  shippingPrice: number;
  totalPrice: number;
  requestedProducts: string[];
  shops: ScenarioExportShop[];
  pageUrl?: string;
};

export function formatExportPrice(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

/** Es. `4_ricerche_eur_35_99_16-07-2026.pdf` */
export function buildScenarioExportFilename(
  document: ScenarioExportDocument,
  extension: "pdf" | "txt" = "pdf",
  date: Date = new Date()
): string {
  const ricerche =
    document.requestedProducts.length > 0
      ? document.requestedProducts.length
      : document.coverageTotal;

  const cents = Math.round(Math.max(0, document.totalPrice) * 100);
  const euros = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, "0");

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  return `${ricerche}_ricerche_eur_${euros}_${decimals}_${dd}-${mm}-${yyyy}.${extension}`;
}

export function formatExportSummary(
  copertura: number,
  coperturaTotale: number,
  prezzoProdotti: number,
  prezzoSpedizione: number
): string {
  const spedizioneLabel =
    prezzoSpedizione > 0
      ? `spedizione ${formatExportPrice(prezzoSpedizione)}`
      : "spedizione 0 €";

  return `${copertura}/${coperturaTotale} referenze · prodotti ${formatExportPrice(prezzoProdotti)} · ${spedizioneLabel}`;
}

export function buildMatchShareText(scenario: ScenarioCarrello): string {
  return `${scenario.titolo} -> totale ${formatExportPrice(scenario.prezzo_totale)}`;
}

export function buildScenarioExportDocument(
  scenario: ScenarioCarrello,
  catalogById: Record<string, TabellaEcommerce>,
  tiersByEcommerce: Record<string, ShippingTier[]>,
  prodottiRichiesti: string[] = [],
  pageUrl?: string
): ScenarioExportDocument {
  const shops: ScenarioExportShop[] = Object.entries(scenario.ordini).map(
    ([ecomId, voci]) => {
      const ecom = catalogById[ecomId];
      const productsPrice = voci.reduce((sum, voce) => sum + voce.prezzo_riga, 0);
      const shippingPrice = calcolaSpedizione(
        productsPrice,
        tiersByEcommerce[ecomId] ?? []
      );

      return {
        ecommerceId: ecomId,
        ecommerceName: ecom?.ecommerce_name ?? ecomId,
        itemCount: voci.length,
        coverageTotal: scenario.copertura_totale,
        productsPrice,
        shippingPrice,
        totalPrice: productsPrice + shippingPrice,
        items: voci.map((voce) => ({
          productName: voce.offerta.product_name,
          brand: voce.offerta.brand?.trim() || null,
          quantity: voce.quantita,
          unitPrice: voce.offerta.prezzo,
          linePrice: voce.prezzo_riga,
          url: voce.offerta.original_url?.trim() || null,
        })),
      };
    }
  );

  return {
    title: normalizeExportTitle(scenario.titolo),
    coverage: scenario.copertura,
    coverageTotal: scenario.copertura_totale,
    productsPrice: scenario.prezzo_prodotti,
    shippingPrice: scenario.prezzo_spedizione,
    totalPrice: scenario.prezzo_totale,
    requestedProducts: prodottiRichiesti,
    shops,
    pageUrl,
  };
}

/** Rinomina titoli legacy; lascia le emoji (il PDF le rimuove a parte). */
function normalizeExportTitle(title: string): string {
  const withoutEmoji = title
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F/g, "")
    .trim();

  if (/risparmio\s+assoluto/i.test(withoutEmoji)) {
    const emojiPrefix = title.match(/^\p{Extended_Pictographic}\uFE0F?/u)?.[0] ?? "";
    return `${emojiPrefix}Miglior soluzione`;
  }

  return title.trim() || "Miglior soluzione";
}

export function stripExportEmojis(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F/g, "")
    .replace(/[\u200D\u200B]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function lineItemDisplayName(item: ScenarioExportLineItem): string {
  const brand = item.brand?.trim();
  return brand ? `${item.productName} (${brand})` : item.productName;
}

function lineItemPriceLabel(item: ScenarioExportLineItem): string {
  return item.quantity > 1
    ? `${item.quantity} × ${formatExportPrice(item.unitPrice)} = ${formatExportPrice(item.linePrice)}`
    : formatExportPrice(item.linePrice);
}

export function exportDocumentToText(document: ScenarioExportDocument): string {
  const lines: string[] = [];

  if (document.requestedProducts.length > 0) {
    lines.push("---RICHIESTA---");
    for (const prodotto of document.requestedProducts) {
      lines.push(`🔍 ${prodotto}`);
    }
    lines.push("");
  }

  lines.push("---RISPOSTA---");
  lines.push(
    `${document.title} -> totale ${formatExportPrice(document.totalPrice)}`
  );
  lines.push(
    formatExportSummary(
      document.coverage,
      document.coverageTotal,
      document.productsPrice,
      document.shippingPrice
    ),
    ""
  );

  for (const shop of document.shops) {
    lines.push(
      `👉 ${shop.ecommerceName} — ${formatExportPrice(shop.totalPrice)}`
    );
    lines.push(
      formatExportSummary(
        shop.itemCount,
        shop.coverageTotal,
        shop.productsPrice,
        shop.shippingPrice
      )
    );

    for (const item of shop.items) {
      lines.push(
        `• ${lineItemDisplayName(item)} — ${lineItemPriceLabel(item)}`
      );
      if (item.url) {
        lines.push(`  ${item.url}`);
      }
    }

    lines.push("");
  }

  if (document.pageUrl) {
    lines.push(`Trovi tutto al link: ${document.pageUrl}`);
  }

  lines.push("");
  lines.push("❤️‍🔥 Giuseppe");

  return lines.join("\n").trim();
}

export function buildScenarioInfoText(
  scenario: ScenarioCarrello,
  catalogById: Record<string, TabellaEcommerce>,
  tiersByEcommerce: Record<string, ShippingTier[]>,
  pageUrl?: string,
  prodottiRichiesti: string[] = []
): string {
  return exportDocumentToText(
    buildScenarioExportDocument(
      scenario,
      catalogById,
      tiersByEcommerce,
      prodottiRichiesti,
      pageUrl
    )
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLineItem(raw: unknown): ScenarioExportLineItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  if (typeof item.productName !== "string" || !item.productName.trim()) {
    return null;
  }
  if (!isFiniteNumber(item.quantity) || item.quantity < 1) return null;
  if (!isFiniteNumber(item.unitPrice) || !isFiniteNumber(item.linePrice)) {
    return null;
  }

  return {
    productName: item.productName.trim(),
    brand:
      typeof item.brand === "string" && item.brand.trim()
        ? item.brand.trim()
        : null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    linePrice: item.linePrice,
    url:
      typeof item.url === "string" && item.url.trim() ? item.url.trim() : null,
  };
}

function parseShop(raw: unknown): ScenarioExportShop | null {
  if (!raw || typeof raw !== "object") return null;
  const shop = raw as Record<string, unknown>;

  if (typeof shop.ecommerceId !== "string" || !shop.ecommerceId.trim()) {
    return null;
  }
  if (typeof shop.ecommerceName !== "string" || !shop.ecommerceName.trim()) {
    return null;
  }
  if (
    !isFiniteNumber(shop.itemCount) ||
    !isFiniteNumber(shop.coverageTotal) ||
    !isFiniteNumber(shop.productsPrice) ||
    !isFiniteNumber(shop.shippingPrice) ||
    !isFiniteNumber(shop.totalPrice) ||
    !Array.isArray(shop.items)
  ) {
    return null;
  }

  const items: ScenarioExportLineItem[] = [];
  for (const rawItem of shop.items) {
    const item = parseLineItem(rawItem);
    if (!item) return null;
    items.push(item);
  }

  return {
    ecommerceId: shop.ecommerceId.trim(),
    ecommerceName: shop.ecommerceName.trim(),
    itemCount: shop.itemCount,
    coverageTotal: shop.coverageTotal,
    productsPrice: shop.productsPrice,
    shippingPrice: shop.shippingPrice,
    totalPrice: shop.totalPrice,
    items,
  };
}

export function parseScenarioExportDocument(
  raw: unknown
): ScenarioExportDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;

  if (typeof doc.title !== "string" || !doc.title.trim()) return null;
  if (
    !isFiniteNumber(doc.coverage) ||
    !isFiniteNumber(doc.coverageTotal) ||
    !isFiniteNumber(doc.productsPrice) ||
    !isFiniteNumber(doc.shippingPrice) ||
    !isFiniteNumber(doc.totalPrice) ||
    !Array.isArray(doc.requestedProducts) ||
    !Array.isArray(doc.shops)
  ) {
    return null;
  }

  const requestedProducts: string[] = [];
  for (const product of doc.requestedProducts) {
    if (typeof product !== "string") return null;
    requestedProducts.push(product);
  }

  const shops: ScenarioExportShop[] = [];
  for (const rawShop of doc.shops) {
    const shop = parseShop(rawShop);
    if (!shop) return null;
    shops.push(shop);
  }

  return {
    title: doc.title.trim(),
    coverage: doc.coverage,
    coverageTotal: doc.coverageTotal,
    productsPrice: doc.productsPrice,
    shippingPrice: doc.shippingPrice,
    totalPrice: doc.totalPrice,
    requestedProducts,
    shops,
    pageUrl:
      typeof doc.pageUrl === "string" && doc.pageUrl.trim()
        ? doc.pageUrl.trim()
        : undefined,
  };
}
