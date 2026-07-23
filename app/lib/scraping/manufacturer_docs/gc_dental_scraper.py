"""
Scraper SDS GC Europe (locale IT) → manufacturer_documents.

Strategia:
  - Categorie prodotto statiche (da /europe/it-IT/products) — non cambiano spesso
  - Per ogni categoria: listing prodotti (`article.ct-product`)
  - Per ogni prodotto: sezione `#downloads` / `.gc-product--downloads`
    → fieldset "Scheda Tecnica e di Sicurezza" + path `/sds/*.pdf`
  - HTTP + BeautifulSoup (HTML server-side; gate HCP solo client-side)
  - Upsert DB di default (come Ivoclar/Kerr); dry/smoke per test

Uso:
  python app/lib/scraping/manufacturer_docs/gc_dental_scraper.py
  python app/lib/scraping/manufacturer_docs/gc_dental_scraper.py --config path.json

Config (tutti opzionali):
  {
    "upsert": true,
    "categories": null,          // null = tutte le CATEGORIES; oppure ["restore","cement"]
    "max_products": null,        // soft stop sul n. prodotti visitati
    "max_docs": null,            // soft stop sul n. SDS raccolte
    "request_delay_sec": 0.4,
    "out_json": "gc_full_run.json",
    "sds_only": true
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

from bs4 import BeautifulSoup
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

SITE_ORIGIN = "https://www.gc.dental"
LOCALE_PATH = "europe/it-IT"
PRODUCTS_INDEX = f"{SITE_ORIGIN}/{LOCALE_PATH}/products"

SOURCE_SLUG = "gc-dental"
SOURCE_NAME = "GC Dental"
SOURCE_DOMAIN = "gc.dental"

TABLE_SOURCES = "document_sources"
TABLE_DOCS = "manufacturer_documents"

# Categorie statiche da https://www.gc.dental/europe/it-IT/products (lug 2026)
CATEGORIES: list[dict[str, str]] = [
    {"slug": "prevention", "name": "Prevenzione"},
    {"slug": "prepare", "name": "Preparare"},
    {"slug": "restore", "name": "Restaurare"},
    {"slug": "capture", "name": "Rilevare"},
    {"slug": "model", "name": "Mock-up"},
    {"slug": "manufacture", "name": "Produzione"},
    {"slug": "veneer", "name": "Veneer"},
    {"slug": "cement", "name": "Cemento"},
    {"slug": "other", "name": "Altro"},
]

CATEGORY_SLUGS = {c["slug"] for c in CATEGORIES}

DEFAULT_UPSERT = True
DEFAULT_SDS_ONLY = True
DEFAULT_DELAY_SEC = 0.4
DEFAULT_OUT_JSON = "gc_full_run.json"
UPSERT_BATCH = 100
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ASSET_TYPE_MAP: dict[str, str] = {
    "scheda tecnica e di sicurezza": "sds",
    "scheda di sicurezza": "sds",
    "schede di sicurezza": "sds",
    "sds": "sds",
    "safety data sheet": "sds",
    "safety data sheets": "sds",
    "istruzioni d'uso": "ifu",
    "istruzioni dʼuso": "ifu",
    "istruzioni per l'uso": "ifu",
    "ifu": "ifu",
    "manuale": "technique_guide",
    "depliant": "flyer",
    "leaflet": "flyer",
    "riferimenti scientifici e articoli clinici": "scientific_manual",
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


def absolute_url(href: str) -> str:
    return urllib.parse.urljoin(SITE_ORIGIN + "/", href)


def canonical_file_url(file_url: str) -> str:
    parsed = urllib.parse.urlparse(file_url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def category_url(slug: str) -> str:
    return f"{PRODUCTS_INDEX}/{slug}"


def product_url(slug: str) -> str:
    return f"{PRODUCTS_INDEX}/{slug}"


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", errors="replace")


def get_supabase():
    from supabase import create_client

    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "
            "in .env.local"
        )
    return create_client(url, key)


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
                    "listing_url": PRODUCTS_INDEX,
                    "locale_path": LOCALE_PATH,
                    "strategy": "category → product page downloads (/sds/)",
                    "categories": [c["slug"] for c in CATEGORIES],
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


def extract_products_from_category(
    html: str,
    *,
    category_slug: str,
    category_name: str,
) -> list[dict[str, str]]:
    """Prodotti reali del listing categoria (evita carousel/footer focus)."""
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict[str, str]] = []
    seen: set[str] = set()

    for article in soup.select("article.ct-product"):
        link = article.select_one('a[href*="/products/"]')
        if not link:
            continue
        href = absolute_url(link.get("href") or "")
        parsed = urllib.parse.urlparse(href)
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            continue
        slug = parts[-1].lower()
        if slug in CATEGORY_SLUGS or slug in seen or slug == "bpa":
            continue
        name_el = article.select_one(".field--name-node-title, h2, h3, a[rel='bookmark']")
        name = (name_el.get_text(" ", strip=True) if name_el else "") or slug
        # subtitle as fallback enrichment
        subtitle_el = article.select_one(".field--name-field-ct-product-subtitle")
        subtitle = subtitle_el.get_text(" ", strip=True) if subtitle_el else ""
        seen.add(slug)
        out.append(
            {
                "slug": slug,
                "name": name,
                "subtitle": subtitle,
                "url": product_url(slug),
                "category_slug": category_slug,
                "category_name": category_name,
            }
        )
    return out


def extract_docs_from_product(
    html: str,
    *,
    product: dict[str, str],
    sds_only: bool,
) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.select_one("h1")
    product_name = (h1.get_text(" ", strip=True) if h1 else "") or product.get("name") or ""

    root = soup.select_one(".gc-product--downloads") or soup.select_one("#downloads")
    if not root:
        return []

    docs: list[dict[str, Any]] = []
    for fs in root.select("fieldset"):
        legend_el = fs.select_one("legend")
        legend = legend_el.get_text(" ", strip=True) if legend_el else ""
        for a in fs.select("a[href]"):
            href = absolute_url(a.get("href") or "")
            if not href.lower().endswith(".pdf"):
                continue
            path_l = urllib.parse.urlparse(href).path.lower()
            is_sds = "/sds/" in path_l or re.search(r"(?:^|/)sds_", Path(path_l).name) is not None
            if sds_only and not is_sds:
                continue
            label = a.get_text(" ", strip=True) or Path(urllib.parse.urlparse(href).path).name
            raw_type = (
                (legend or "Scheda Tecnica e di Sicurezza")
                if is_sds
                else (legend or "other")
            )
            docs.append(
                {
                    "file_url": canonical_file_url(href),
                    "title": label,
                    "raw_asset_type": raw_type,
                    "product_name": product_name,
                    "product_slug": product["slug"],
                    "product_url": product["url"],
                    "category_slug": product.get("category_slug"),
                    "category_name": product.get("category_name"),
                    "is_sds": bool(is_sds),
                }
            )
    return docs


def doc_to_row(doc: dict[str, Any], source_id: str, now_iso: str) -> dict[str, Any]:
    file_url = canonical_file_url(str(doc["file_url"]))
    parsed = urllib.parse.urlparse(file_url)
    stem = Path(parsed.path).stem
    title = (doc.get("title") or "").strip() or stem
    raw_asset = doc.get("raw_asset_type")
    asset_type = "sds" if doc.get("is_sds") else normalize_asset_type(
        str(raw_asset) if raw_asset else None
    )
    product_name = (doc.get("product_name") or "").strip() or None
    slug = f"{SOURCE_SLUG}-{slugify(stem)}-{short_hash(file_url)}"

    search_bits = [
        title,
        str(raw_asset or ""),
        str(product_name or ""),
        str(doc.get("category_name") or ""),
        file_url,
    ]
    search_payload = " ".join(b for b in search_bits if b).strip()

    # Chiavi canoniche lette da app/lib/docs/document.ts → parseOther (/docs/[slug]).
    # Le extra GC sono ignorate da parseOther ma restano utili in DB.
    other: dict[str, Any] = {
        "raw_asset_type": raw_asset,
        "source_page_url": doc.get("product_url") or PRODUCTS_INDEX,
        "thumbnail_image": None,
        "search_payload": search_payload,
        "target": None,
        "primary_tag": raw_asset,
        "pill_color": None,
        "download_button_label": "Scarica",
        "details_button_label": None,
        "search_text": search_payload,
        "dam_path": parsed.path,
        "filter_tag": "sds" if asset_type == "sds" else None,
        "filter_label": raw_asset,
        "locale": "it",
        "product_slug": doc.get("product_slug"),
        "category_slug": doc.get("category_slug"),
        "category_name": doc.get("category_name"),
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


def resolve_categories(config: dict[str, Any]) -> list[dict[str, str]]:
    raw = config.get("categories")
    if not raw:
        return list(CATEGORIES)
    wanted = {str(x).strip().lower() for x in raw}
    selected = [c for c in CATEGORIES if c["slug"] in wanted]
    unknown = wanted - {c["slug"] for c in selected}
    if unknown:
        log(f"WARN categorie sconosciute ignorate: {sorted(unknown)}")
    return selected


def run(config: dict[str, Any]) -> dict[str, Any]:
    do_upsert = bool(config.get("upsert", DEFAULT_UPSERT))
    sds_only = bool(config.get("sds_only", DEFAULT_SDS_ONLY))
    delay = float(config.get("request_delay_sec", DEFAULT_DELAY_SEC))
    max_products = config.get("max_products")
    max_products_i = int(max_products) if max_products is not None else None
    max_docs = config.get("max_docs")
    max_docs_i = int(max_docs) if max_docs is not None else None
    out_name = str(config.get("out_json") or DEFAULT_OUT_JSON)
    out_path = Path(__file__).resolve().parent / out_name
    categories = resolve_categories(config)

    log("=== Avvio GC Dental SDS scraper ===")
    log(
        f"categories={[c['slug'] for c in categories]} sds_only={sds_only} "
        f"max_products={max_products_i} max_docs={max_docs_i} "
        f"delay={delay}s upsert={do_upsert}"
    )

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
    products: list[dict[str, str]] = []
    products_by_cat: dict[str, int] = {}
    errors: list[dict[str, str]] = []

    for cat in categories:
        url = category_url(cat["slug"])
        log(f"Categoria {cat['slug']} → {url}")
        try:
            html = fetch_html(url)
            found = extract_products_from_category(
                html,
                category_slug=cat["slug"],
                category_name=cat["name"],
            )
            products_by_cat[cat["slug"]] = len(found)
            products.extend(found)
            log(f"  prodotti: {len(found)}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            msg = f"{type(e).__name__}: {e}"
            log(f"  ERRORE categoria: {msg}")
            errors.append({"stage": "category", "url": url, "error": msg})
        if delay > 0:
            time.sleep(delay)

    # Dedup prodotti (stesso slug in più categorie: tieni il primo)
    deduped: list[dict[str, str]] = []
    seen_slugs: set[str] = set()
    for p in products:
        if p["slug"] in seen_slugs:
            continue
        seen_slugs.add(p["slug"])
        deduped.append(p)
    products = deduped
    log(f"Prodotti unici da visitare: {len(products)}")

    if max_products_i is not None:
        products = products[:max_products_i]
        log(f"Soft cap max_products → {len(products)}")

    rows: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    products_with_sds = 0
    products_without_sds = 0
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    for idx, product in enumerate(products, start=1):
        if max_docs_i is not None and len(rows) >= max_docs_i:
            log(f"Stop soft max_docs={max_docs_i}")
            break
        log(f"[{idx}/{len(products)}] {product['slug']} — {product['name']}")
        try:
            html = fetch_html(product["url"])
            docs = extract_docs_from_product(html, product=product, sds_only=sds_only)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            msg = f"{type(e).__name__}: {e}"
            log(f"  ERRORE prodotto: {msg}")
            errors.append({"stage": "product", "url": product["url"], "error": msg})
            if delay > 0:
                time.sleep(delay)
            continue

        if docs:
            products_with_sds += 1
        else:
            products_without_sds += 1

        added = 0
        for doc in docs:
            if max_docs_i is not None and len(rows) >= max_docs_i:
                break
            row = doc_to_row(doc, source_id, now_iso)
            if row["file_url"] in seen_urls:
                continue
            seen_urls.add(row["file_url"])
            rows.append(row)
            added += 1
        log(f"  docs={len(docs)} nuovi={added} cumul={len(rows)}")
        if delay > 0:
            time.sleep(delay)

    total_upserted = 0
    if do_upsert and rows and supabase is not None:
        log(f"Upsert {len(rows)} documenti su {TABLE_DOCS}...")
        total_upserted = upsert_batches(supabase, rows, session_total=0)
    elif not do_upsert:
        log("Upsert disabilitato (dry-run)")

    type_counts: dict[str, int] = {}
    for row in rows:
        at = row.get("asset_type") or "other"
        type_counts[at] = type_counts.get(at, 0) + 1

    elapsed = round(time.monotonic() - t0, 1)
    summary: dict[str, Any] = {
        "source_slug": SOURCE_SLUG,
        "categories": [c["slug"] for c in categories],
        "products_by_category": products_by_cat,
        "products_unique": len(seen_slugs),
        "products_visited": len(products),
        "products_with_sds": products_with_sds,
        "products_without_sds": products_without_sds,
        "docs": len(rows),
        "upserted": total_upserted,
        "asset_type_breakdown": dict(sorted(type_counts.items(), key=lambda x: (-x[1], x[0]))),
        "errors": errors,
        "elapsed_sec": elapsed,
        "db_upsert": do_upsert,
        "sds_only": sds_only,
        "sample": [
            {
                "title": r.get("title"),
                "product_name": r.get("product_name"),
                "asset_type": r.get("asset_type"),
                "file_url": r.get("file_url"),
                "category": (r.get("other") or {}).get("category_slug"),
            }
            for r in rows[:12]
        ],
        "documents": rows,
    }
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log(
        f"FATTO docs={len(rows)} upserted={total_upserted} "
        f"visited={len(products)} with_sds={products_with_sds} "
        f"errors={len(errors)} | {elapsed}s"
    )
    log(f"JSON → {out_path}")
    log("Breakdown asset_type:")
    for k, v in summary["asset_type_breakdown"].items():
        log(f"  {k}: {v}")
    return summary


def prompt_mode() -> dict[str, Any]:
    require_interactive_tty(
        "python app/lib/scraping/manufacturer_docs/gc_dental_scraper.py --config ..."
    )
    print()
    print("GC Dental SDS scraper")
    print('  Invio / "y" → tutte le categorie + upsert DB')
    print("  dry        → tutte le categorie, no upsert")
    print("  smoke      → restore, max 12 prodotti, no upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True, "out_json": "gc_full_run.json"}
        if raw == "dry":
            return {
                "upsert": False,
                "out_json": "gc_dry_full_run.json",
            }
        if raw == "smoke":
            return {
                "upsert": False,
                "categories": ["restore"],
                "max_products": 12,
                "out_json": "gc_smoke_run.json",
            }
        print("Invio / dry / smoke")


def main() -> None:
    config_path = parse_config_path()
    if config_path is not None:
        config = load_config(config_path)
    else:
        config = prompt_mode()
    run(config)


if __name__ == "__main__":
    main()
