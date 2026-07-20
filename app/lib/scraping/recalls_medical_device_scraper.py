"""
Scraper avvisi di sicurezza dispositivi medici — Ministero della Salute.

Flusso:
  1. Carica l'indice completo da page-data.json della lista portale
  2. Ordina dal più recente (numero_riferimento desc)
  3. Per ogni avviso non ancora in DB, scarica il page-data del dettaglio
  4. Upsert su recalls_medical_device (unique: numero_riferimento)
  5. Stop dopo N duplicati consecutivi (default 10)

Uso:
  python app/lib/scraping/recalls_medical_device_scraper.py
  python app/lib/scraping/recalls_medical_device_scraper.py --limit 5
  python app/lib/scraping/recalls_medical_device_scraper.py --stop-after-dupes 10
  python app/lib/scraping/recalls_medical_device_scraper.py --full
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import Client, create_client

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

# Cursor sandbox a volte punta a un path Playwright vuoto.
os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SITE_ORIGIN = "https://www.salute.gov.it"
SITE_BASE = f"{SITE_ORIGIN}/new"
LIST_URL = f"{SITE_BASE}/it/avvisi/avvisi-di-sicurezza-sui-dispositivi-medici/"
LIST_PAGE_DATA_URL = (
    f"{SITE_BASE}/page-data/it/avvisi/"
    "avvisi-di-sicurezza-sui-dispositivi-medici/page-data.json"
)
TABLE = "recalls_medical_device"

DEFAULT_STOP_AFTER_DUPES = 10
DETAIL_DELAY_SEC = 0.35
PROGRESS_EVERY = 50
ERROR_LOG_PATH = Path(__file__).with_name("recalls_medical_device_errors.log")

MONTHS_IT = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def parse_italian_date(value: Any) -> date | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return date.fromisoformat(text)

    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return date(year, month, day)
        except ValueError:
            return None

    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})", text, flags=re.IGNORECASE)
    if m:
        day = int(m.group(1))
        month = MONTHS_IT.get(m.group(2).lower())
        year = int(m.group(3))
        if month:
            try:
                return date(year, month, day)
            except ValueError:
                return None

    return None


def absolute_url(path: str | None) -> str | None:
    if not path:
        return None
    path = str(path).strip()
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return urljoin(SITE_BASE + "/", path.lstrip("/"))


def page_url_from_alias(alias: str | None) -> str | None:
    if not alias:
        return None
    alias = alias.strip()
    if not alias.startswith("/"):
        alias = "/" + alias
    if alias.startswith("/it/"):
        return f"{SITE_BASE}{alias}"
    return f"{SITE_BASE}/it{alias}"


def page_data_url_from_alias(alias: str | None) -> str | None:
    page = page_url_from_alias(alias)
    if not page:
        return None
    # https://www.salute.gov.it/new/it/... -> .../page-data/it/.../page-data.json
    suffix = page.removeprefix(SITE_BASE).rstrip("/")
    return f"{SITE_BASE}/page-data{suffix}/page-data.json"


def human_mb(filesize: Any) -> str | None:
    try:
        size = int(filesize)
    except (TypeError, ValueError):
        return None
    return f"{size / (1024 * 1024):.2f} Mb"


def ref_sort_key(numero: str | None) -> int:
    if not numero:
        return -1
    digits = re.sub(r"\D", "", str(numero))
    try:
        return int(digits) if digits else -1
    except ValueError:
        return -1


def fetch_json(page, url: str) -> dict[str, Any]:
    result = page.evaluate(
        """async (u) => {
            const r = await fetch(u, { credentials: 'include' });
            const text = await r.text();
            return { status: r.status, text };
        }""",
        url,
    )
    status = result.get("status")
    text = result.get("text") or ""
    if status != 200:
        raise RuntimeError(f"HTTP {status} per {url}")

    data = json.loads(text)
    if not isinstance(data, dict):
        raise RuntimeError(f"JSON non-oggetto per {url}")
    return data


def load_index_nodes(page) -> list[dict[str, Any]]:
    log("Download indice page-data lista...")
    payload = fetch_json(page, LIST_PAGE_DATA_URL)
    data = payload.get("result", {}).get("data", {})
    ext_nodes = (data.get("avvisiDiSicurezzaEXT") or {}).get("nodes") or []
    legacy_nodes = (data.get("avvisiDiSicurezza") or {}).get("nodes") or []
    log(f"Indice: {len(ext_nodes)} EXT + {len(legacy_nodes)} legacy")

    merged: list[dict[str, Any]] = []
    seen_refs: set[str] = set()

    for source, nodes in (("ext", ext_nodes), ("legacy", legacy_nodes)):
        for node in nodes:
            ref = (
                node.get("field_numero_riferimento")
                or node.get("field_numeroriferimento")
                or ""
            )
            ref = str(ref).strip()
            if not ref or ref in seen_refs:
                continue
            seen_refs.add(ref)
            alias = (node.get("path") or {}).get("alias")
            merged.append(
                {
                    "source": source,
                    "numero_riferimento": ref,
                    "title": (node.get("title") or "").strip() or None,
                    "fabbricante": (node.get("field_fabbricante") or "").strip() or None,
                    "nome_dispositivo": (node.get("field_nome_dispositivo") or "").strip()
                    or None,
                    "tipo_dispositivo": (node.get("field_tipo_dispositivo") or "").strip()
                    or None,
                    "data_ricezione_raw": node.get("dataRicezione")
                    or node.get("field_data_ricezione"),
                    "descrizione": node.get("field_descrizione_dispositivo"),
                    "anno": node.get("field_anno"),
                    "alias": alias,
                    "link_pagina": page_url_from_alias(alias),
                    "page_data_url": page_data_url_from_alias(alias),
                }
            )

    def sort_key(item: dict[str, Any]) -> tuple[int, int]:
        parsed = parse_italian_date(item.get("data_ricezione_raw"))
        day_ord = parsed.toordinal() if parsed else -1
        return (day_ord, ref_sort_key(item["numero_riferimento"]))

    merged.sort(key=sort_key, reverse=True)
    log(f"Indice unificato: {len(merged)} avvisi unici")
    return merged


def extract_pdfs_from_ext(node_ext: dict[str, Any]) -> list[dict[str, Any]]:
    allegati = (node_ext.get("relationships") or {}).get("field_allegato_avviso") or []
    pdfs: list[dict[str, Any]] = []
    for allegato in allegati:
        rel = allegato.get("relationships") or {}
        file_info = rel.get("field_file_single") or {}
        url = file_info.get("url")
        if not url:
            continue
        tipo = ((rel.get("field_tipo_allegato") or {}).get("name") or "").strip() or None
        nested = (file_info.get("relationships") or {}).get(
            "paragraph__ext_allegato_avviso"
        ) or []
        nested_date = nested[0].get("field_data") if nested else None
        pdfs.append(
            {
                "url": absolute_url(url),
                "filename": file_info.get("filename"),
                "mime": file_info.get("filemime"),
                "size_bytes": file_info.get("filesize"),
                "size_label": human_mb(file_info.get("filesize")),
                "date": parse_italian_date(allegato.get("field_data") or nested_date),
                "azione": (tipo[:1].upper() + tipo[1:].lower()) if tipo else None,
                "azione_raw": tipo,
            }
        )
    return pdfs


def extract_pdfs_from_legacy(node: dict[str, Any]) -> list[dict[str, Any]]:
    files = (node.get("relationships") or {}).get("field_file_allegato") or []
    pdfs: list[dict[str, Any]] = []
    for file_info in files:
        url = file_info.get("url") or ((file_info.get("uri") or {}).get("url"))
        if not url:
            continue
        pdfs.append(
            {
                "url": absolute_url(url),
                "filename": file_info.get("filename"),
                "mime": file_info.get("filemime"),
                "size_bytes": file_info.get("filesize"),
                "size_label": human_mb(file_info.get("filesize")),
                "date": None,
                "azione": None,
                "azione_raw": None,
            }
        )
    return pdfs


def parse_detail(page_data: dict[str, Any], index_item: dict[str, Any]) -> dict[str, Any]:
    result = page_data.get("result") or {}
    data = result.get("data") or {}
    node_ext = data.get("nodeExt")
    node = data.get("node") or (result.get("pageContext") or {}).get("node") or {}

    if node_ext:
        source = "ext"
        numero = (
            node_ext.get("field_numero_riferimento")
            or index_item["numero_riferimento"]
        )
        titolo = (node_ext.get("title") or index_item.get("title") or "").strip() or None
        fabbricante = (
            (node_ext.get("field_fabbricante") or index_item.get("fabbricante") or "")
            .strip()
            or None
        )
        nome = (
            (
                node_ext.get("field_nome_dispositivo")
                or index_item.get("nome_dispositivo")
                or ""
            ).strip()
            or None
        )
        tipo = (
            (
                node_ext.get("field_tipo_dispositivo")
                or index_item.get("tipo_dispositivo")
                or ""
            ).strip()
            or None
        )
        data_ricezione = parse_italian_date(
            node_ext.get("field_data_ricezione") or index_item.get("data_ricezione_raw")
        )
        data_aggiornamento = parse_italian_date(node_ext.get("field_data_agg"))
        pdfs = extract_pdfs_from_ext(node_ext)
        descrizione = index_item.get("descrizione") or node.get(
            "field_descrizione_dispositivo"
        )
        anno = node_ext.get("field_anno") or index_item.get("anno")
    else:
        source = "legacy"
        numero = (
            node.get("field_numero_riferimento")
            or node.get("field_numeroriferimento")
            or index_item["numero_riferimento"]
        )
        titolo = (node.get("title") or index_item.get("title") or "").strip() or None
        fabbricante = (
            (node.get("field_fabbricante") or index_item.get("fabbricante") or "")
            .strip()
            or None
        )
        nome = (
            (
                node.get("field_nome_dispositivo")
                or index_item.get("nome_dispositivo")
                or ""
            ).strip()
            or None
        )
        tipo = (
            (
                node.get("field_tipo_dispositivo")
                or index_item.get("tipo_dispositivo")
                or ""
            ).strip()
            or None
        )
        data_ricezione = parse_italian_date(
            node.get("field_data_ricezione") or index_item.get("data_ricezione_raw")
        )
        data_aggiornamento = None
        pdfs = extract_pdfs_from_legacy(node)
        descrizione = node.get("field_descrizione_dispositivo") or index_item.get(
            "descrizione"
        )
        anno = node.get("field_anno") or index_item.get("anno")

    numero = str(numero).strip()
    first_pdf = pdfs[0] if pdfs else None
    extra_pdfs = pdfs[1:] if len(pdfs) > 1 else []

    other: dict[str, Any] = {
        "source": source,
        "anno": anno,
        "descrizione_dispositivo": descrizione,
    }
    if data_aggiornamento:
        other["data_ultimo_aggiornamento"] = data_aggiornamento.isoformat()
    if first_pdf:
        if first_pdf.get("azione"):
            other["azione"] = first_pdf["azione"]
        elif first_pdf.get("azione_raw"):
            other["azione"] = first_pdf["azione_raw"]
        if first_pdf.get("date"):
            other["pdf_data"] = first_pdf["date"].isoformat()
        if first_pdf.get("filename"):
            other["pdf_filename"] = first_pdf["filename"]
        if first_pdf.get("mime"):
            other["pdf_mime"] = first_pdf["mime"]
        if first_pdf.get("size_label"):
            other["pdf_size"] = first_pdf["size_label"]
        if first_pdf.get("size_bytes") is not None:
            other["pdf_size_bytes"] = first_pdf["size_bytes"]
    if extra_pdfs:
        other["pdf_allegati"] = [
            {
                "url": p.get("url"),
                "filename": p.get("filename"),
                "mime": p.get("mime"),
                "size_bytes": p.get("size_bytes"),
                "size_label": p.get("size_label"),
                "date": p["date"].isoformat() if p.get("date") else None,
                "azione": p.get("azione") or p.get("azione_raw"),
            }
            for p in extra_pdfs
        ]

    # data_pubblicazione: stessa data mostrata in lista (ricezione)
    data_pub = parse_italian_date(index_item.get("data_ricezione_raw")) or data_ricezione

    return {
        "titolo_rss": titolo,
        "link_pagina": index_item.get("link_pagina"),
        "data_pubblicazione": data_pub.isoformat() if data_pub else None,
        "fabbricante": fabbricante,
        "nome_dispositivo": nome,
        "tipo_dispositivo": tipo,
        "numero_riferimento": numero,
        "data_ricezione": data_ricezione.isoformat() if data_ricezione else None,
        "link_pdf_allegato": first_pdf.get("url") if first_pdf else None,
        "data_acquisizione": date.today().isoformat(),
        "other": other,
    }


def existing_refs() -> set[str]:
    refs: set[str] = set()
    page_size = 1000
    start = 0
    while True:
        response = (
            supabase.table(TABLE)
            .select("numero_riferimento")
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            break
        for row in rows:
            ref = row.get("numero_riferimento")
            if ref:
                refs.add(str(ref).strip())
        if len(rows) < page_size:
            break
        start += page_size
    return refs


def upsert_record(record: dict[str, Any]) -> None:
    supabase.table(TABLE).upsert(
        record,
        on_conflict="numero_riferimento",
    ).execute()


def append_error(
    seq: int,
    index_pos: int,
    index_total: int,
    ref: str,
    alias: str | None,
    detail_url: str | None,
    exc: BaseException,
) -> None:
    line = (
        f"{datetime.now().isoformat(timespec='seconds')} | "
        f"ERR#{seq} | pos={index_pos}/{index_total} | "
        f"ref={ref} | alias={alias or '-'} | "
        f"url={detail_url or '-'} | "
        f"{type(exc).__name__}: {exc}"
    )
    with ERROR_LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    log(line)


def run(
    limit: int | None,
    stop_after_dupes: int | None,
    full: bool,
) -> None:
    log("=== Avvio scraper recalls_medical_device ===")
    if full:
        log("Modalità --full: scorri tutto l'indice, salta i già presenti, no early-stop")
        stop_after_dupes = None
    try:
        test = supabase.table(TABLE).select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test: {len(test.data or [])} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    known = existing_refs()
    log(f"Record già in DB: {len(known)}")
    log(f"Error log: {ERROR_LOG_PATH}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()
        log(f"Warmup challenge sito -> {LIST_URL}")
        page.goto(LIST_URL, wait_until="domcontentloaded", timeout=90000)
        time.sleep(2)

        index = load_index_nodes(page)
        if limit is not None:
            index = index[:limit]
            log(f"Limit attivo: processo al massimo {limit} avvisi dall'indice")

        nuovi = 0
        saltati = 0
        errori = 0
        consecutive_dupes = 0
        started_at = time.monotonic()

        for i, item in enumerate(index, start=1):
            ref = item["numero_riferimento"]
            if ref in known:
                saltati += 1
                consecutive_dupes += 1
                if (
                    stop_after_dupes is not None
                    and consecutive_dupes >= stop_after_dupes
                ):
                    log(
                        f"Stop: {consecutive_dupes} duplicati consecutivi "
                        f"(soglia {stop_after_dupes}) dopo {i} elementi scansionati"
                    )
                    break
                continue

            consecutive_dupes = 0
            detail_url = item.get("page_data_url")
            if not detail_url:
                errori += 1
                append_error(
                    seq=errori,
                    index_pos=i,
                    index_total=len(index),
                    ref=ref,
                    alias=item.get("alias"),
                    detail_url=None,
                    exc=RuntimeError("alias/page_data_url assente"),
                )
                continue

            try:
                detail = fetch_json(page, detail_url)
                record = parse_detail(detail, item)
                if not record.get("numero_riferimento"):
                    raise RuntimeError("numero_riferimento mancante nel dettaglio")
                upsert_record(record)
                known.add(ref)
                nuovi += 1
                if nuovi <= 20 or nuovi % PROGRESS_EVERY == 0:
                    elapsed = time.monotonic() - started_at
                    rate = nuovi / elapsed if elapsed > 0 else 0
                    log(
                        f"[{i}/{len(index)}] NEW#{nuovi} {ref} — "
                        f"{item.get('fabbricante')} / {item.get('nome_dispositivo')} "
                        f"({rate:.1f}/s, err={errori}, skip={saltati})"
                    )
            except Exception as e:
                errori += 1
                append_error(
                    seq=errori,
                    index_pos=i,
                    index_total=len(index),
                    ref=ref,
                    alias=item.get("alias"),
                    detail_url=detail_url,
                    exc=e,
                )

            if i % PROGRESS_EVERY == 0:
                elapsed = time.monotonic() - started_at
                log(
                    f"CHECKPOINT {i}/{len(index)} — nuovi={nuovi}, "
                    f"skip={saltati}, err={errori}, elapsed={elapsed/60:.1f}m"
                )

            time.sleep(DETAIL_DELAY_SEC)

        browser.close()

    log(
        f"=== Fine: nuovi={nuovi}, già presenti/saltati={saltati}, "
        f"errori={errori}, totali in DB ora~={len(known)} ==="
    )
    if errori:
        log(f"Riassunto errori sequenziali in: {ERROR_LOG_PATH}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scraper avvisi dispositivi medici Ministero della Salute"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Processa al massimo N avvisi dall'indice (smoke test)",
    )
    parser.add_argument(
        "--stop-after-dupes",
        type=int,
        default=DEFAULT_STOP_AFTER_DUPES,
        help=f"Stop dopo N duplicati consecutivi (default {DEFAULT_STOP_AFTER_DUPES})",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Backfill completo: salta i già presenti ma non fa early-stop",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.limit is not None and args.limit < 1:
        log("--limit deve essere >= 1")
        sys.exit(1)
    if not args.full and args.stop_after_dupes < 1:
        log("--stop-after-dupes deve essere >= 1")
        sys.exit(1)
    run(
        limit=args.limit,
        stop_after_dupes=args.stop_after_dupes,
        full=args.full,
    )


if __name__ == "__main__":
    main()
