"""
Scraper Download Center Ivoclar (locale IT) → manufacturer_documents.

Strategia (simile a Dentsply, NON Playwright come Kerr):
  - DAM Celum/Anura pubblico: dam.ivoclarvivadent.com/anura/external_it/
  - Listing via JSONP `node.do` (search vuota + paginate ≤199)
  - Tutti i tipi documento del DAM (SDS, brochure, guide, flyer, …)
    mappati in `asset_type` canonico (colonna DB)
  - Download stabile: asset.do?download={asset_id}&locale=it
  - Completeness: unique asset_id vs `total` della risposta API
  - Upsert su (source_id, file_url) per re-run idempotenti
  - Schema `other` allineato a Kerr/Dentsply per /docs/[slug]

Nota: le IFU ufficiali sono su eIFU (fuori da questo scraper).

Uso:
  python app/lib/scraping/manufacturer_docs/ivoclar_scraper.py
  python app/lib/scraping/manufacturer_docs/ivoclar_scraper.py --config path.json

Config (tutti opzionali):
  {
    "page_size": 199,
    "max_docs": null,
    "min_completeness_ratio": 0.95,
    "upsert": true,
    "out_json": "ivoclar_full_run.json",
    "dc": "it",
    "locale": "it"
  }
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

SCRAPING_DIR = Path(__file__).resolve().parent.parent
if str(SCRAPING_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPING_DIR))

from scrape_cli import load_config, parse_config_path, require_interactive_tty

ROOT_DIR = Path(__file__).resolve().parents[4]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

SITE_ORIGIN = "https://www.ivoclar.com"
LISTING_URL = f"{SITE_ORIGIN}/it_it/downloadcenter/#dc=it&lang=it"
DAM_ORIGIN = "https://dam.ivoclarvivadent.com"

SOURCE_SLUG = "ivoclar"
SOURCE_NAME = "Ivoclar"
SOURCE_DOMAIN = "ivoclar.com"

TABLE_SOURCES = "document_sources"
TABLE_DOCS = "manufacturer_documents"

# InfoField IDs da custom.js del Download Center
INFO_BRANCH = 210
INFO_PRO_CAT = 211
INFO_BRAND = 212
INFO_DOC_TYPE = 535
INFO_LANGUAGE = 272
INFO_PROD_SUBCAT = 542
INFO_LOCATION = 616

INFOFIELDS = (
    f"100,402,{INFO_BRANCH},{INFO_PRO_CAT},{INFO_PROD_SUBCAT},"
    f"{INFO_BRAND},{INFO_DOC_TYPE},267,{INFO_LANGUAGE},"
    f"{INFO_DOC_TYPE},{INFO_LOCATION},270"
)

# Server Anura rifiuta pageSize >= 200
DEFAULT_PAGE_SIZE = 199
DEFAULT_MIN_RATIO = 0.95
DEFAULT_OUT_JSON = "ivoclar_full_run.json"
DEFAULT_UPSERT = True
DEFAULT_DC = "it"
DEFAULT_LOCALE = "it"
UPSERT_BATCH = 100
REQUEST_DELAY_SEC = 0.35
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ASSET_TYPE_MAP: dict[str, str] = {
    # IT
    "schede di sicurezza (sds)": "sds",
    "schede di sicurezza": "sds",
    "sds": "sds",
    "brochure": "brochure",
    "volantino": "flyer",
    "istruzioni brevi": "quick_reference",
    "guida tecnica": "technique_guide",
    "diagramma di flusso": "processing_guide",
    "case book": "scientific_manual",
    "whitepaper": "scientific_manual",
    "rapporto scientifico": "scientific_manual",
    "documentazione scientifica": "scientific_manual",
    "guidelines": "technique_guide",
    "infografica": "flyer",
    "sscp": "sscp",
    "catalogo": "brochure",
    "instructions for use": "ifu",
    "istruzioni d'uso": "ifu",
    "istruzioni per l'uso": "ifu",
    "ifu": "ifu",
    # EN (alcuni label restano EN anche su locale IT)
    "safety data sheets (sds)": "sds",
    "safety data sheets": "sds",
    "flyer": "flyer",
    "flow chart": "processing_guide",
    "scientific report": "scientific_manual",
    "advertisement": "other",
    "battlecard": "other",
    "special edition": "other",
    "tabella modellazione dente": "other",
}


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def slugify(text: str, *, max_len: int = 80) -> str:
    norm = unicodedata.normalize("NFKD", text or "")
    ascii_text = norm.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    if not slug:
        slug = "doc"
    return slug[:max_len].strip("-") or "doc"


def short_hash(value: str, *, n: int = 8) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:n]


def normalize_asset_type(raw: str | None) -> str:
    if not raw:
        return "other"
    key = unicodedata.normalize("NFKD", raw)
    key = "".join(c for c in key if not unicodedata.combining(c))
    key = key.strip().lower()
    if key in ASSET_TYPE_MAP:
        return ASSET_TYPE_MAP[key]
    for needle, canon in ASSET_TYPE_MAP.items():
        if needle in key:
            return canon
    return "other"


def dam_server(dc: str) -> str:
    return f"{DAM_ORIGIN}/anura/external_{dc}"


def download_url(asset_id: int | str, *, dc: str, locale: str) -> str:
    return (
        f"{dam_server(dc)}/asset.do?"
        f"{urllib.parse.urlencode({'download': str(asset_id), 'locale': locale})}"
    )


def thumb_url(asset_id: int | str, *, dc: str) -> str:
    return f"{dam_server(dc)}/asset.do?thumb={asset_id}&big=true&img=a.jpg"


def parse_jsonp(raw: str) -> dict[str, Any]:
    text = raw.strip()
    m = re.match(r"^[^(]+\((.*)\)\s*;?\s*$", text, re.S)
    if not m:
        raise ValueError(f"Risposta non JSONP (prefix={text[:80]!r})")
    data = json.loads(m.group(1))
    if not isinstance(data, dict):
        raise ValueError("JSONP root non è un oggetto")
    return data


def anura_get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    qs = urllib.parse.urlencode(params, doseq=True)
    full = f"{url}?{qs}"
    req = urllib.request.Request(
        full,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Referer": LISTING_URL,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    payload = parse_jsonp(raw)
    status = payload.get("status")
    if status not in (None, 200):
        raise RuntimeError(
            f"Anura status={status} message={payload.get('message')!r} url={full[:180]}"
        )
    return payload


def fetch_listing_page(
    *,
    dc: str,
    locale: str,
    page: int,
    page_size: int,
) -> dict[str, Any]:
    if page_size < 1 or page_size >= 200:
        raise ValueError("page_size deve essere 1..199 (limite server Anura)")
    return anura_get(
        f"{dam_server(dc)}/node.do",
        {
            "callback": "cb",
            "search": "",
            "locale": locale,
            "alt_name": "0",
            "extended": "true",
            "sort_order": "score",
            "sort_order_seq": "desc",
            "infofields": INFOFIELDS,
            "paginate": str(page_size),
            "page": str(page),
        },
    )


def fetch_all_assets(
    *,
    dc: str,
    locale: str,
    page_size: int,
    max_docs: int | None,
) -> tuple[list[dict[str, Any]], int]:
    """Pagine fino a coprire `total`. Ritorna (assets, catalog_total)."""
    first = fetch_listing_page(dc=dc, locale=locale, page=1, page_size=page_size)
    total = int(first.get("total") or 0)
    page_assets = list(first.get("data") or [])
    assets: list[dict[str, Any]] = []
    seen: set[int] = set()

    def absorb(batch: list[dict[str, Any]]) -> None:
        for item in batch:
            try:
                aid = int(item["id"])
            except (KeyError, TypeError, ValueError):
                continue
            if aid in seen:
                continue
            seen.add(aid)
            assets.append(item)

    absorb(page_assets)
    log(f"Pagina 1: +{len(page_assets)} (unique={len(assets)} / total={total})")

    if max_docs is not None and len(assets) >= max_docs:
        return assets[:max_docs], total

    page = 2
    while len(assets) < total:
        if max_docs is not None and len(assets) >= max_docs:
            break
        time.sleep(REQUEST_DELAY_SEC)
        payload = fetch_listing_page(
            dc=dc, locale=locale, page=page, page_size=page_size
        )
        batch = list(payload.get("data") or [])
        before = len(assets)
        absorb(batch)
        gained = len(assets) - before
        log(
            f"Pagina {page}: +{len(batch)} nuove={gained} "
            f"(unique={len(assets)} / total={total})"
        )
        if not batch or gained == 0:
            log("Stop: pagina vuota o senza nuovi id")
            break
        page += 1
        if page > 500:
            raise RuntimeError("Troppe pagine — possibile loop")

    if max_docs is not None:
        assets = assets[:max_docs]
    return assets, total


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "
            "in .env.local"
        )
    from supabase import create_client

    return create_client(SUPABASE_URL, SUPABASE_KEY)


def ensure_source(supabase) -> str:
    existing = (
        supabase.table(TABLE_SOURCES)
        .select("id")
        .eq("slug", SOURCE_SLUG)
        .limit(1)
        .execute()
    )
    rows = existing.data or []
    if rows:
        return str(rows[0]["id"])

    inserted = (
        supabase.table(TABLE_SOURCES)
        .insert(
            {
                "slug": SOURCE_SLUG,
                "name": SOURCE_NAME,
                "domain": SOURCE_DOMAIN,
                "logo_url": None,
                "is_active": True,
                "other": {
                    "listing_url": LISTING_URL,
                    "dam_origin": DAM_ORIGIN,
                    "locale_path": "it_it",
                    "strategy": "anura node.do search paginate (external_it)",
                    "eifu_url": "https://www.ivoclar.com/eifu",
                    "note": "IFU ufficiali su eIFU, non nel DAM Download Center",
                },
            }
        )
        .execute()
    )
    return str(inserted.data[0]["id"])


def upsert_batches(supabase, rows: list[dict[str, Any]], *, session_total: int) -> int:
    saved = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        supabase.table(TABLE_DOCS).upsert(
            batch,
            on_conflict="source_id,file_url",
        ).execute()
        saved += len(batch)
        log(
            f"Upsert OK: +{len(batch)} "
            f"(batch sessione {session_total + saved})"
        )
    return saved


def info_get(item: dict[str, Any], field_id: int) -> str | None:
    fields = item.get("infofields") or {}
    if not isinstance(fields, dict):
        return None
    val = fields.get(str(field_id))
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def asset_to_row(
    item: dict[str, Any],
    source_id: str,
    now_iso: str,
    *,
    dc: str,
    locale: str,
) -> dict[str, Any] | None:
    try:
        asset_id = int(item["id"])
    except (KeyError, TypeError, ValueError):
        return None
    if not item.get("downloadable", True):
        return None

    file_url = download_url(asset_id, dc=dc, locale=locale)
    title = (item.get("name") or item.get("alt_name") or "").strip()
    if not title:
        title = f"Ivoclar asset {asset_id}"

    raw_asset = info_get(item, INFO_DOC_TYPE)
    asset_type = normalize_asset_type(raw_asset)
    product_name = info_get(item, INFO_BRAND) or info_get(item, INFO_PROD_SUBCAT)
    category = info_get(item, INFO_PRO_CAT)
    language = info_get(item, INFO_LANGUAGE)
    extension = (item.get("extension") or "").strip().lower() or None
    size = item.get("size")

    slug = f"{SOURCE_SLUG}-{asset_id}-{slugify(title)}-{short_hash(file_url)}"
    thumb = thumb_url(asset_id, dc=dc)

    search_bits = [
        title,
        str(raw_asset or ""),
        str(product_name or ""),
        str(category or ""),
        str(language or ""),
        file_url,
    ]
    search_payload = " ".join(b for b in search_bits if b).strip()

    # Chiavi allineate a dentsply/kerr (consumate da /docs via parseOther)
    other: dict[str, Any] = {
        "raw_asset_type": raw_asset,
        "source_page_url": LISTING_URL,
        "thumbnail_image": thumb,
        "search_payload": search_payload,
        "target": None,
        "primary_tag": raw_asset,
        "pill_color": None,
        "download_button_label": "Scarica",
        "details_button_label": None,
        "search_text": search_payload,
        "dam_path": f"/asset.do?download={asset_id}",
        "filter_tag": None,
        "filter_label": raw_asset,
        "locale": locale,
        # Extra Ivoclar (ignorati da parseOther; utili in DB / debug)
        "asset_id": asset_id,
        "dc": dc,
        "product_category": category,
        "product_line": info_get(item, INFO_PROD_SUBCAT),
        "language": language,
        "file_extension": extension,
        "file_size": size,
        "modified_ms": item.get("modified"),
        "created_ms": item.get("created"),
        "pages": item.get("pages"),
        "parents": item.get("parents"),
    }

    return {
        "source_id": source_id,
        "slug": slug,
        "title": title,
        "description": None,
        "asset_type": asset_type,
        "file_url": file_url,
        "product_name": product_name,
        "last_seen_at": now_iso,
        "is_active": True,
        "updated_at": now_iso,
        "other": other,
    }


def run(config: dict[str, Any]) -> dict[str, Any]:
    page_size = int(config.get("page_size", DEFAULT_PAGE_SIZE))
    min_ratio = float(config.get("min_completeness_ratio", DEFAULT_MIN_RATIO))
    do_upsert = bool(config.get("upsert", DEFAULT_UPSERT))
    max_docs = config.get("max_docs")
    max_docs_i = int(max_docs) if max_docs is not None else None
    dc = str(config.get("dc") or DEFAULT_DC).strip().lower()
    locale = str(config.get("locale") or DEFAULT_LOCALE).strip().lower()
    out_name = str(config.get("out_json") or DEFAULT_OUT_JSON)
    out_path = Path(__file__).resolve().parent / out_name

    log("=== Avvio Ivoclar Download Center (Anura DAM) ===")
    log(
        f"dc={dc} locale={locale} page_size={page_size} "
        f"max_docs={max_docs_i} min_ratio={min_ratio} upsert={do_upsert}"
    )
    log("Nota: IFU ufficiali sono su eIFU (non in questo catalogo DAM).")

    supabase = None
    source_id = "00000000-0000-0000-0000-000000000000"
    if do_upsert:
        try:
            supabase = get_supabase()
            test = supabase.table(TABLE_DOCS).select("id").limit(1).execute()
            log(f"Connessione Supabase OK (test: {len(test.data or [])} righe)")
        except Exception as e:
            log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
            sys.exit(1)
        source_id = ensure_source(supabase)
        log(f"document_sources slug={SOURCE_SLUG} id={source_id}")
    else:
        log("Dry-run: nessun contatto DB (source_id placeholder)")

    t0 = time.monotonic()
    try:
        assets, catalog_total = fetch_all_assets(
            dc=dc,
            locale=locale,
            page_size=page_size,
            max_docs=max_docs_i,
        )
    except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as e:
        log(f"Fetch Anura FALLITO -> {type(e).__name__}: {e}")
        sys.exit(1)

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    rows: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    skipped = 0
    for item in assets:
        row = asset_to_row(item, source_id, now_iso, dc=dc, locale=locale)
        if not row:
            skipped += 1
            continue
        if row["file_url"] in seen_urls:
            skipped += 1
            continue
        seen_urls.add(row["file_url"])
        rows.append(row)

    total_upserted = 0
    if do_upsert and rows and supabase is not None:
        log(f"Upsert {len(rows)} documenti su {TABLE_DOCS}...")
        total_upserted = upsert_batches(supabase, rows, session_total=0)
    elif not do_upsert:
        log("Upsert disabilitato (dry-run)")

    raw_counts: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    for row in rows:
        raw = (row.get("other") or {}).get("raw_asset_type") or "(missing)"
        raw_counts[str(raw)] = raw_counts.get(str(raw), 0) + 1
        at = row.get("asset_type") or "other"
        type_counts[at] = type_counts.get(at, 0) + 1

    elapsed = round(time.monotonic() - t0, 1)
    ratio = (len(rows) / catalog_total) if catalog_total else None
    complete_ok = True
    if catalog_total and max_docs_i is None and ratio is not None:
        complete_ok = ratio >= min_ratio

    summary: dict[str, Any] = {
        "source_slug": SOURCE_SLUG,
        "dc": dc,
        "locale": locale,
        "listing_url": LISTING_URL,
        "strategy": "anura node.do paginate",
        "catalog_total": catalog_total,
        "fetched_assets": len(assets),
        "unique_rows": len(rows),
        "skipped": skipped,
        "completeness_ratio": round(ratio, 4) if ratio is not None else None,
        "completeness_ok": complete_ok,
        "upserted": total_upserted,
        "elapsed_sec": elapsed,
        "raw_asset_type_breakdown": dict(
            sorted(raw_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ),
        "asset_type_breakdown": dict(
            sorted(type_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ),
        "sample": rows[:5],
        "db_upsert": do_upsert,
        "eifu_note": "IFU su https://www.ivoclar.com/eifu (fuori da questo DAM)",
    }

    out_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log(
        f"FATTO unique={len(rows)} upserted={total_upserted} catalog={catalog_total} "
        f"ratio={summary['completeness_ratio']} ok={complete_ok} "
        f"elapsed={elapsed}s → {out_path.name}"
    )
    log("Breakdown asset_type:")
    for k, v in summary["asset_type_breakdown"].items():
        log(f"  {k}: {v}")
    log("Breakdown raw_asset_type:")
    for k, v in summary["raw_asset_type_breakdown"].items():
        log(f"  {k}: {v}")

    if not complete_ok and max_docs_i is None:
        log(
            f"ATTENZIONE: completezza sotto soglia "
            f"({summary['completeness_ratio']} < {min_ratio})"
        )
        sys.exit(2)
    return summary


def prompt_mode() -> dict[str, Any]:
    print()
    print("Ivoclar Download Center — modalità")
    print('  Invio / "y" → full catalog + upsert DB')
    print("  dry        → full senza upsert (smoke)")
    print("  smoke      → max 40 docs, no upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True}
        if raw == "dry":
            return {"upsert": False}
        if raw == "smoke":
            return {"upsert": False, "max_docs": 40, "out_json": "ivoclar_smoke_run.json"}
        print("Invio / dry / smoke")


def main() -> None:
    config_path = parse_config_path()
    if config_path is None:
        require_interactive_tty(
            "python app/lib/scraping/manufacturer_docs/ivoclar_scraper.py"
        )
        config = prompt_mode()
    else:
        config = load_config(config_path)
        log(f"Config: {config_path}")
    run(config)


if __name__ == "__main__":
    main()
