import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import {
  buildScenarioExportFilename,
  formatExportPrice,
  formatExportSummary,
  stripExportEmojis,
  type ScenarioExportDocument,
  type ScenarioExportLineItem,
} from "@/app/lib/search/scenario-export";

const PAGE_MARGIN = 48;
const COL_GAP = 10;
const HEADER_IMAGE_SIZE = 56;
const HEADER_IMAGE_GAP = 14;
const HEADER_BOTTOM_GAP = 28;

function resolveGiuseppeImagePath(): string | null {
  const imagePath = path.join(process.cwd(), "public", "giuseppe.jpeg");
  return fs.existsSync(imagePath) ? imagePath : null;
}

function lineItemDisplayName(item: ScenarioExportLineItem): string {
  const brand = item.brand?.trim();
  const name = brand ? `${item.productName} (${brand})` : item.productName;
  return stripExportEmojis(name);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - PAGE_MARGIN;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 28);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#52525b")
    .text(title.toUpperCase(), { characterSpacing: 0.6 });
  doc.moveDown(0.4);
  doc.fillColor("#18181b");
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  cols: { x: number; width: number; label: string; align?: "left" | "right" }[]
) {
  ensureSpace(doc, 22);
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#71717a");
  for (const col of cols) {
    doc.text(col.label, col.x, y, {
      width: col.width,
      align: col.align ?? "left",
      lineBreak: false,
    });
  }
  doc.y = y + 12;
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y)
    .strokeColor("#e4e4e7")
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.35);
  doc.fillColor("#18181b");
}

export function exportDocumentToPdf(
  document: ScenarioExportDocument
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: PAGE_MARGIN,
      info: {
        Title: buildScenarioExportFilename(document, "pdf").replace(/\.pdf$/i, ""),
        Author: "Giuseppe",
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const contentWidth = pdf.page.width - PAGE_MARGIN * 2;
    const headerImagePath = resolveGiuseppeImagePath();
    const headerStartY = pdf.y;
    const textX = headerImagePath
      ? PAGE_MARGIN + HEADER_IMAGE_SIZE + HEADER_IMAGE_GAP
      : PAGE_MARGIN;
    const textWidth = headerImagePath
      ? contentWidth - HEADER_IMAGE_SIZE - HEADER_IMAGE_GAP
      : contentWidth;

    if (headerImagePath) {
      const radius = 10;
      pdf.save();
      pdf
        .roundedRect(
          PAGE_MARGIN,
          headerStartY,
          HEADER_IMAGE_SIZE,
          HEADER_IMAGE_SIZE,
          radius
        )
        .clip();
      pdf.image(headerImagePath, PAGE_MARGIN, headerStartY, {
        width: HEADER_IMAGE_SIZE,
        height: HEADER_IMAGE_SIZE,
      });
      pdf.restore();
    }

    pdf
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#18181b")
      .text("Giuseppe", textX, headerStartY + 6, {
        width: textWidth,
      });
    pdf
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#71717a")
      .text(
        "Confronto prezzi e prodotti su +100K articoli disponibili",
        textX,
        pdf.y + 2,
        { width: textWidth }
      );

    pdf.x = PAGE_MARGIN;
    pdf.y =
      headerStartY +
      (headerImagePath ? HEADER_IMAGE_SIZE : 36) +
      HEADER_BOTTOM_GAP;

    if (document.requestedProducts.length > 0) {
      drawSectionTitle(pdf, "Richiesta");
      pdf.font("Helvetica").fontSize(10).fillColor("#3f3f46");
      for (const prodotto of document.requestedProducts) {
        ensureSpace(pdf, 16);
        pdf.text(`•  ${stripExportEmojis(prodotto)}`, { width: contentWidth });
      }
      pdf.moveDown(1);
    }

    drawSectionTitle(pdf, "Risposta");
    {
      const title = stripExportEmojis(document.title);
      const totalLabel = formatExportPrice(document.totalPrice);
      const titleStartY = pdf.y;
      pdf
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#18181b")
        .text(title, PAGE_MARGIN, titleStartY, {
          width: contentWidth * 0.62,
        });
      pdf
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#18181b")
        .text(totalLabel, PAGE_MARGIN, titleStartY, {
          width: contentWidth,
          align: "right",
        });
      pdf.y = Math.max(pdf.y, titleStartY + 16);
    }
    pdf
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#71717a")
      .text(
        formatExportSummary(
          document.coverage,
          document.coverageTotal,
          document.productsPrice,
          document.shippingPrice
        ),
        { width: contentWidth }
      );
    pdf.moveDown(1);

    const colProduct = PAGE_MARGIN;
    const colQtyWidth = 36;
    const colPriceWidth = 78;
    const colQty =
      pdf.page.width - PAGE_MARGIN - colPriceWidth - colQtyWidth - COL_GAP;
    const colPrice = pdf.page.width - PAGE_MARGIN - colPriceWidth;
    const productWidth = colQty - colProduct - COL_GAP;

    for (const shop of document.shops) {
      ensureSpace(pdf, 56);
      const shopStartY = pdf.y;
      pdf
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#18181b")
        .text(stripExportEmojis(shop.ecommerceName), PAGE_MARGIN, shopStartY, {
          width: contentWidth * 0.65,
        });
      pdf
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(formatExportPrice(shop.totalPrice), PAGE_MARGIN, shopStartY, {
          width: contentWidth,
          align: "right",
        });
      pdf.y = Math.max(pdf.y, shopStartY + 14);

      pdf
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#71717a")
        .text(
          formatExportSummary(
            shop.itemCount,
            shop.coverageTotal,
            shop.productsPrice,
            shop.shippingPrice
          ),
          { width: contentWidth }
        );
      pdf.moveDown(0.5);

      drawTableHeader(pdf, [
        { x: colProduct, width: productWidth, label: "Prodotto" },
        { x: colQty, width: colQtyWidth, label: "Qty", align: "right" },
        { x: colPrice, width: colPriceWidth, label: "Prezzo", align: "right" },
      ]);

      for (const item of shop.items) {
        const name = lineItemDisplayName(item);
        const nameHeight = pdf.heightOfString(name, {
          width: productWidth,
        });
        const urlHeight = item.url
          ? pdf.heightOfString(item.url, { width: productWidth }) * 0.85
          : 0;
        ensureSpace(pdf, Math.max(14, nameHeight) + urlHeight + 8);

        const y = pdf.y;
        pdf.font("Helvetica").fontSize(9).fillColor("#18181b");
        pdf.text(name, colProduct, y, { width: productWidth });
        const afterNameY = pdf.y;

        pdf.text(String(item.quantity), colQty, y, {
          width: colQtyWidth,
          align: "right",
          lineBreak: false,
        });
        pdf.text(formatExportPrice(item.linePrice), colPrice, y, {
          width: colPriceWidth,
          align: "right",
          lineBreak: false,
        });

        pdf.y = afterNameY;
        if (item.url) {
          pdf
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#71717a")
            .text(item.url, colProduct, pdf.y, {
              width: productWidth,
              link: item.url,
              underline: true,
            });
        }

        pdf.moveDown(0.35);
        pdf.fillColor("#18181b");
      }

      ensureSpace(pdf, 28);
      pdf
        .moveTo(PAGE_MARGIN, pdf.y)
        .lineTo(pdf.page.width - PAGE_MARGIN, pdf.y)
        .strokeColor("#e4e4e7")
        .lineWidth(0.5)
        .stroke();
      pdf.moveDown(0.4);

      const metaRows: [string, string][] = [
        ["Prodotti", formatExportPrice(shop.productsPrice)],
        ["Spedizione", formatExportPrice(shop.shippingPrice)],
        ["Subtotale", formatExportPrice(shop.totalPrice)],
      ];

      for (const [label, value] of metaRows) {
        ensureSpace(pdf, 14);
        const y = pdf.y;
        const isTotal = label === "Subtotale";
        pdf
          .font(isTotal ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor(isTotal ? "#18181b" : "#52525b")
          .text(label, colProduct, y, {
            width: productWidth,
            lineBreak: false,
          });
        pdf.text(value, colPrice, y, {
          width: colPriceWidth,
          align: "right",
          lineBreak: false,
        });
        pdf.y = y + 13;
      }

      pdf.moveDown(1);
    }

    ensureSpace(pdf, 36);
    pdf
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#18181b")
      .text(`Totale complessivo  ${formatExportPrice(document.totalPrice)}`, {
        width: contentWidth,
        align: "right",
      });

    if (document.pageUrl) {
      pdf.moveDown(1.2);
      pdf
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#3f3f46")
        .text("Informazioni complete qui: ", PAGE_MARGIN, pdf.y, {
          width: contentWidth,
          continued: true,
          align: "left",
        });
      pdf
        .fillColor("#18181b")
        .text(document.pageUrl, {
          link: document.pageUrl,
          underline: true,
          align: "left",
        });
    }

    pdf.end();
  });
}
