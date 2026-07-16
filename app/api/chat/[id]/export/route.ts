import { NextResponse } from "next/server";

import { getProductSearchChat } from "@/app/lib/search/chat-store";
import { exportDocumentToPdf } from "@/app/lib/search/scenario-export-pdf";
import {
  buildScenarioExportFilename,
  exportDocumentToText,
  parseScenarioExportDocument,
} from "@/app/lib/search/scenario-export";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      format?: unknown;
      document?: unknown;
    };

    const format = body.format === "text" ? "text" : body.format === "pdf" ? "pdf" : null;
    if (!format) {
      return NextResponse.json(
        { error: "Formato non valido. Usa pdf o text." },
        { status: 400 }
      );
    }

    const document = parseScenarioExportDocument(body.document);
    if (!document) {
      return NextResponse.json(
        { error: "Documento di export non valido" },
        { status: 400 }
      );
    }

    const chat = await getProductSearchChat(id);
    if (!chat) {
      return NextResponse.json({ error: "Ricerca non trovata" }, { status: 404 });
    }

    if (format === "text") {
      const text = exportDocumentToText(document);
      const filename = buildScenarioExportFilename(document, "txt");
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const pdfBuffer = await exportDocumentToPdf(document);
    const filename = buildScenarioExportFilename(document, "pdf");
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("Export failed:", error);
    const message =
      error instanceof Error ? error.message : "Errore durante l'export";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
