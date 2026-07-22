"""
Scraper Download Center Dentsply Sirona (locale IT) → manufacturer_documents.

Strategia: una call per asset-type con filterTag + pageSize alto (default 10000),
senza paginazione offset (il server taglia ~1000 sull'offset).

Asset type ammessi (testo libero in colonna `asset_type`; mapping IT → canone):
  ifu                        ← Istruzioni per l'uso
  sds                        ← Scheda di sicurezza
  declaration_of_conformity  ← Dichiarazione di conformità
  ce_certificate             ← Certificato CE
  qms_certificate            ← Certificato SGQ / QMS
  label                      ← Etichetta
  glossary                   ← Glossario
  processing_guide           ← Guida alla lavorazione
  technique_guide            ← Guida tecnica
  quick_reference            ← Guide di riferimento rapido
  cadcam_library             ← Librerie CADCAM
  brochure                   ← Opuscolo / Brochures
  flyer                      ← Volantino / Flyers
  recycling_pass             ← Passaggio per il riciclo
  care                       ← Piano di cura e pulizia
  installation_requirements  ← Requisiti per l'installazione
  sscp                       ← SSCP
  terms                      ← Termini e condizioni
  scientific_ce              ← Scientifico e CE
  other                      ← tutto ciò che non mappa

Uso (terminale integrato):
  python app/lib/scraping/manufacturer_docs/dentsply_sirona_scraper.py
  python app/lib/scraping/manufacturer_docs/dentsply_sirona_scraper.py --config path.json
    config: { "page_size": 10000 }
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
from supabase import Client, create_client

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

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

SITE_ORIGIN = "https://www.dentsplysirona.com"
LISTING_JSON = (
    f"{SITE_ORIGIN}/content/dentsply-sirona-dt/it/it/customer-support/"
    "download-center/jcr:content/root/container/"
    "downloadlisting.downloadlisting.json"
)

SOURCE_SLUG = "dentsply-sirona"
SOURCE_NAME = "Dentsply Sirona"
SOURCE_DOMAIN = "dentsplysirona.com"

TABLE_SOURCES = "document_sources"
TABLE_DOCS = "manufacturer_documents"

DEFAULT_PAGE_SIZE = 10_000
UPSERT_BATCH = 100
REQUEST_DELAY_SEC = 0.5
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ASSET_TYPE_MAP: dict[str, str] = {
    "istruzioni per l'uso": "ifu",
    "instructions for use": "ifu",
    "ifu": "ifu",
    "scheda di sicurezza": "sds",
    "safety data sheet": "sds",
    "sds": "sds",
    "dichiarazione di conformità": "declaration_of_conformity",
    "dichiarazione di conformita": "declaration_of_conformity",
    "declaration of conformity": "declaration_of_conformity",
    "certificato ce": "ce_certificate",
    "ce certificate": "ce_certificate",
    "certificato sgq": "qms_certificate",
    "qms certificate": "qms_certificate",
    "certificato qms": "qms_certificate",
    "etichetta": "label",
    "label": "label",
    "glossario": "glossary",
    "glossary": "glossary",
    "guida alla lavorazione": "processing_guide",
    "processing guides": "processing_guide",
    "guida tecnica": "technique_guide",
    "guide di riferimento rapido": "quick_reference",
    "quick reference guide": "quick_reference",
    "librerie cadcam": "cadcam_library",
    "cad/cam libraries": "cadcam_library",
    "opuscolo": "brochure",
    "brochures": "brochure",
    "brochure": "brochure",
    "volantino": "flyer",
    "flyers": "flyer",
    "flyer": "flyer",
    "passaggio per il riciclo": "recycling_pass",
    "recycling passes": "recycling_pass",
    "piano di cura e pulizia": "care",
    "care and cleaning plan": "care",
    "care": "care",
    "requisiti per l'installazione": "installation_requirements",
    "installation requirements": "installation_requirements",
    "sscp summary of safety and clinical performance": "sscp",
    "sscp": "sscp",
    "termini e condizioni": "terms",
    "terms & conditions": "terms",
    "terms and conditions": "terms",
    "scientifico e ce": "scientific_ce",
    "scientific manuals": "scientific_manual",
}


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def prompt_page_size(default: int = DEFAULT_PAGE_SIZE) -> int:
    print()
    print("pageSize per ogni filtro asset-type (una sola call, no offset)")
    print(f'  Invio / "y" → {default} (consigliato per catalogo completo IT)')
    print("  Numero N    → usa N (max 10000)")

    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return default
        if re.fullmatch(r"\d+", raw):
            n = int(raw)
            if 1 <= n <= 10_000:
                return n
            print("Inserisci un numero tra 1 e 10000.")
            continue
        print(f"Invio per {default}, oppure un numero.")


def slugify(text: str, *, max_len: int = 80) -> str:
    norm = unicodedata.normalize("NFKD", text or "")
    ascii_text = norm.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    if not slug:
        slug = "doc"
    return slug[:max_len].strip("-") or "doc"


def absolute_url(path: str | None) -> str | None:
    if not path:
        return None
    path = str(path).strip()
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return urllib.parse.urljoin(SITE_ORIGIN, path)


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


def short_hash(value: str, *, n: int = 8) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:n]


def fetch_listing(*, page_size: int, filter_tag: str | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {
        "offset": 0,
        "pageSize": page_size,
        "sort": "desc",
    }
    if filter_tag:
        params["filterTag"] = filter_tag
    qs = urllib.parse.urlencode(params, doseq=True)
    url = f"{LISTING_JSON}?{qs}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.load(resp)


def extract_asset_type_filters(payload: dict[str, Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for fk, opts in (payload.get("filter") or {}).items():
        if "Asset Type" not in fk and "Tipo di risorsa" not in fk:
            continue
        for opt in opts or []:
            tag_id = opt.get("tagId")
            value = opt.get("value")
            if tag_id and value:
                out.append({"tagId": str(tag_id), "value": str(value)})
    return out


def ensure_source() -> str:
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
                    "listing_json": LISTING_JSON,
                    "locale_path": "it/it",
                    "strategy": "filterTag + pageSize (no offset pagination)",
                },
            }
        )
        .execute()
    )
    return str(inserted.data[0]["id"])


def item_to_row(
    item: dict[str, Any],
    source_id: str,
    now_iso: str,
    *,
    filter_tag: str | None,
    filter_label: str | None,
) -> dict[str, Any] | None:
    link = item.get("link")
    file_url = absolute_url(link if isinstance(link, str) else None)
    if not file_url:
        return None

    title = (item.get("title") or "").strip() or Path(
        urllib.parse.urlparse(file_url).path
    ).name
    description = (item.get("description") or "").strip() or None
    raw_asset = item.get("assetType")
    asset_type = normalize_asset_type(str(raw_asset) if raw_asset else None)

    details_path = item.get("detailsPagePath")
    source_page_url = absolute_url(
        details_path if isinstance(details_path, str) else None
    )
    thumb = absolute_url(
        item.get("thumbnailImage")
        if isinstance(item.get("thumbnailImage"), str)
        else None
    )

    search_bits = [title, description or "", str(raw_asset or ""), file_url]
    search_payload = " ".join(b for b in search_bits if b).strip()

    dam_stem = Path(urllib.parse.urlparse(file_url).path).stem
    slug = f"{SOURCE_SLUG}-{slugify(dam_stem)}-{short_hash(file_url)}"

    other: dict[str, Any] = {
        "raw_asset_type": raw_asset,
        "source_page_url": source_page_url,
        "thumbnail_image": thumb,
        "search_payload": search_payload,
        "target": item.get("target"),
        "primary_tag": item.get("primaryTag"),
        "pill_color": item.get("pillColor"),
        "download_button_label": item.get("downloadButtonLabel"),
        "details_button_label": item.get("detailsButtonLabel"),
        "search_text": item.get("searchText"),
        "dam_path": link,
        "filter_tag": filter_tag,
        "filter_label": filter_label,
        "locale": "it",
    }

    return {
        "source_id": source_id,
        "slug": slug,
        "title": title,
        "description": description,
        "asset_type": asset_type,
        "file_url": file_url,
        "product_name": None,
        "last_seen_at": now_iso,
        "is_active": True,
        "updated_at": now_iso,
        "other": other,
    }


def upsert_batches(rows: list[dict[str, Any]], *, session_total: int) -> int:
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


def run(page_size: int) -> None:
    log("=== Avvio scraper Dentsply Sirona Download Center (IT) ===")
    log(f"Strategia: filterTag per asset-type | pageSize={page_size} | offset=0 fisso")
    try:
        test = supabase.table(TABLE_DOCS).select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test: {len(test.data or [])} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    source_id = ensure_source()
    log(f"document_sources slug={SOURCE_SLUG} id={source_id}")

    log("Carico elenco filtri asset-type...")
    try:
        seed = fetch_listing(page_size=1)
    except Exception as e:
        log(f"Errore fetch filtri: {type(e).__name__}: {e}")
        sys.exit(1)

    filters = extract_asset_type_filters(seed)
    if not filters:
        log("Nessun filtro Asset Type trovato nel JSON")
        sys.exit(1)
    log(f"Filtri asset-type: {len(filters)}")

    seen_urls: set[str] = set()
    total_fetched = 0
    total_upserted = 0
    total_dupes = 0
    skipped = 0
    unknown_types: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    truncated_filters: list[str] = []
    t0 = time.monotonic()

    for idx, facet in enumerate(filters, start=1):
        tag = facet["tagId"]
        label = facet["value"]
        facet_t0 = time.monotonic()
        log(f"── Filtro {idx}/{len(filters)} | {label} | tag={tag}")

        try:
            payload = fetch_listing(page_size=page_size, filter_tag=tag)
        except urllib.error.HTTPError as e:
            log(f"HTTP {e.code} su filtro {label}: {e}")
            sys.exit(1)
        except Exception as e:
            log(f"Errore fetch filtro {label}: {type(e).__name__}: {e}")
            sys.exit(1)

        items = payload.get("items") or []
        more = bool(payload.get("moreAvailable"))
        log(f"Fetch OK: {len(items)} item (moreAvailable={more})")
        if more:
            truncated_filters.append(label)
            log(
                f"ATTENZIONE: moreAvailable=true su '{label}' → "
                f"alza pageSize (ora {page_size})"
            )

        now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        rows: list[dict[str, Any]] = []
        facet_types: dict[str, int] = {}
        facet_new = 0
        facet_dupes = 0

        for item in items:
            if not isinstance(item, dict):
                skipped += 1
                continue
            raw = item.get("assetType")
            canon = normalize_asset_type(str(raw) if raw else None)
            facet_types[canon] = facet_types.get(canon, 0) + 1
            if canon == "other" and raw:
                key = str(raw).strip()
                unknown_types[key] = unknown_types.get(key, 0) + 1

            row = item_to_row(
                item,
                source_id,
                now_iso,
                filter_tag=tag,
                filter_label=label,
            )
            if not row:
                skipped += 1
                continue

            file_url = row["file_url"]
            if file_url in seen_urls:
                facet_dupes += 1
                total_dupes += 1
                continue
            seen_urls.add(file_url)
            type_counts[canon] = type_counts.get(canon, 0) + 1
            rows.append(row)
            facet_new += 1

        total_fetched += len(items)
        upserted_now = upsert_batches(rows, session_total=total_upserted)
        total_upserted += upserted_now

        elapsed = max(time.monotonic() - t0, 0.001)
        facet_elapsed = max(time.monotonic() - facet_t0, 0.001)
        top_facet = ", ".join(
            f"{k}={v}" for k, v in sorted(facet_types.items(), key=lambda x: -x[1])[:5]
        )
        log(
            f"METRICS filtro={idx}/{len(filters)} '{label}' | "
            f"fetched={len(items)} new={facet_new} dupes={facet_dupes} | "
            f"cumul unique={len(seen_urls)} upserted={total_upserted} | "
            f"{total_upserted / elapsed:.1f} docs/s | filtro {facet_elapsed:.1f}s | "
            f"tipi: {top_facet}"
        )
        time.sleep(REQUEST_DELAY_SEC)

    elapsed = max(time.monotonic() - t0, 0.001)
    log(
        f"FATTO | fetched={total_fetched} upserted={total_upserted} "
        f"dupes_skip={total_dupes} skipped={skipped} unique={len(seen_urls)} | "
        f"{elapsed:.1f}s | {total_upserted / elapsed:.1f} docs/s"
    )
    if truncated_filters:
        log("Filtri ancora truncati (moreAvailable=true): " + ", ".join(truncated_filters))
    if type_counts:
        log("Breakdown asset_type (unici sessione):")
        for label, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            log(f"  {count:5d}  {label}")
    if unknown_types:
        log("assetType grezzi mappati a 'other' (aggiungi ad ASSET_TYPE_MAP se serve):")
        for label, count in sorted(unknown_types.items(), key=lambda x: -x[1]):
            log(f"  {count:4d}  {label}")


def main() -> None:
    config_path = parse_config_path()
    if config_path is not None:
        cfg = load_config(config_path)
        page_size = int(cfg.get("page_size") or DEFAULT_PAGE_SIZE)
        run(page_size)
        return

    require_interactive_tty(
        "python app/lib/scraping/manufacturer_docs/dentsply_sirona_scraper.py"
    )
    page_size = prompt_page_size(DEFAULT_PAGE_SIZE)
    run(page_size)


if __name__ == "__main__":
    main()
