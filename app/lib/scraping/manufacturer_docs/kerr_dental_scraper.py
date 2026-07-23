"""
Scraper Download Center Kerr Dental (locale IT) → manufacturer_documents.

Strategia:
  - Playwright + Chrome di sistema (passa il Client Challenge)
  - Una sola apertura del listing IT
  - Click ripetuti su "Carica altro" (append DOM, 12 card/page)
  - Completezza: unique file_url vs "(N disponibili)"
  - Upsert Supabase come Dentsply Sirona (stesso schema `other` per /docs)

Uso:
  python app/lib/scraping/manufacturer_docs/kerr_dental_scraper.py
  python app/lib/scraping/manufacturer_docs/kerr_dental_scraper.py --config path.json

Config (tutti opzionali):
  {
    "headless": true,
    "max_load_more": 400,
    "settle_ms": 1200,
    "max_docs": null,
    "min_completeness_ratio": 0.95,
    "upsert": true,
    "out_json": "kerr_full_run.json"
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
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
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

SITE_ORIGIN = "https://www.kerrdental.com"
LISTING_URL = f"{SITE_ORIGIN}/it-it/download-center"

SOURCE_SLUG = "kerr-dental"
SOURCE_NAME = "Kerr Dental"
SOURCE_DOMAIN = "kerrdental.com"

TABLE_SOURCES = "document_sources"
TABLE_DOCS = "manufacturer_documents"

DEFAULT_HEADLESS = True
DEFAULT_MAX_LOAD_MORE = 400
DEFAULT_SETTLE_MS = 1200
DEFAULT_MIN_RATIO = 0.95
DEFAULT_OUT_JSON = "kerr_full_run.json"
DEFAULT_UPSERT = True
UPSERT_BATCH = 100
PAGE_READY_TIMEOUT_MS = 90_000
NAV_TIMEOUT_MS = 90_000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

ASSET_TYPE_MAP: dict[str, str] = {
    "safety data sheets (sds)": "sds",
    "safety data sheets": "sds",
    "sds": "sds",
    "instructions for use (ifu)": "ifu",
    "instructions for use": "ifu",
    "ifu": "ifu",
    "instructions": "ifu",
    "conformity statements": "declaration_of_conformity",
    "certificates": "ce_certificate",
    "product brochure": "brochure",
    "brochure": "brochure",
    "flyer": "flyer",
    "flyers": "flyer",
    "sales sheet": "flyer",
    "technique card": "technique_guide",
    "technical document": "technique_guide",
    "technical instructions (ta)": "technique_guide",
    "care instructions (pa)": "care",
    "care instructions": "care",
    "service manual": "technique_guide",
    "product packaging": "label",
    "studies / articles": "scientific_manual",
    "clinical research & articles": "scientific_manual",
    "white paper": "scientific_manual",
    "catalog": "brochure",
    "other": "other",
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


def file_url_identity(file_url: str) -> str:
    """Path Widen senza query variabili (stabilizza upsert tra run)."""
    parsed = urllib.parse.urlparse(file_url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def canonical_file_url(file_url: str) -> str:
    """URL stabile da salvare in manufacturer_documents.file_url."""
    identity = file_url_identity(file_url)
    if "widen.net" in identity:
        return f"{identity}?download=true"
    return identity


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
                    "listing_url": LISTING_URL,
                    "locale_path": "it-it",
                    "strategy": "playwright load-more append (views/ajax)",
                },
            }
        )
        .execute()
    )
    return str(inserted.data[0]["id"])


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


def dismiss_overlays(page) -> None:
    for label in ("Accept All Cookies", "Accetta tutti", "Reject All Cookies"):
        try:
            btn = page.get_by_role("button", name=label)
            if btn.count() > 0 and btn.first.is_visible():
                btn.first.click(timeout=2000)
                page.wait_for_timeout(400)
                return
        except Exception:
            pass
    try:
        page.evaluate(
            """() => {
              document.querySelectorAll(
                '#onetrust-banner-sdk, .onetrust-pc-dark-filter'
              ).forEach(el => el.remove());
            }"""
        )
    except Exception:
        pass


def wait_listing_ready(page) -> None:
    deadline = time.monotonic() + (PAGE_READY_TIMEOUT_MS / 1000.0)
    last_title = ""
    while time.monotonic() < deadline:
        try:
            title = page.title() or ""
        except Exception:
            title = ""
        if title != last_title:
            log(f"Page title: {title!r}")
            last_title = title
        try:
            ready = page.evaluate(
                """() => {
                  const title = (document.title || '').toLowerCase();
                  if (title.includes('client challenge') || title === '') return false;
                  const articles = document.querySelectorAll(
                    'article a.document-download'
                  );
                  const facets = document.querySelectorAll(
                    '[data-facet-alias="dam_document_type"]'
                  );
                  return articles.length > 0 || facets.length > 0;
                }"""
            )
        except Exception:
            ready = False
        if ready:
            return
        page.wait_for_timeout(1000)
    raise PlaywrightTimeoutError(
        f"Listing non pronto entro {PAGE_READY_TIMEOUT_MS}ms "
        f"(ultimo title={last_title!r})"
    )


def extract_doc_type_facets(page) -> list[dict[str, Any]]:
    raw = page.evaluate(
        """() => {
          const out = [];
          const seen = new Set();
          for (const el of document.querySelectorAll(
            '[data-facet-alias="dam_document_type"]'
          )) {
            const value = el.getAttribute('data-facet-raw-value');
            if (!value || seen.has(value)) continue;
            seen.add(value);
            const label = (el.textContent || '').trim();
            const countText = el.closest('label,a,li')
              ?.querySelector('.facet-item__count')
              ?.textContent || '';
            const m = countText.match(/(\\d+)/);
            out.push({
              id: value,
              label,
              expected: m ? Number(m[1]) : null,
            });
          }
          return out;
        }"""
    )
    return list(raw or [])


def extract_total_available(page) -> int | None:
    raw = page.evaluate(
        """() => {
          const t = document.body?.innerText || '';
          const m = t.match(/\\((\\d+)\\s+disponibili\\)/i);
          return m ? Number(m[1]) : null;
        }"""
    )
    return int(raw) if raw is not None else None


def extract_cards(page) -> list[dict[str, Any]]:
    return page.evaluate(
        """() => {
          const cards = [];
          for (const article of document.querySelectorAll('article')) {
            const a = article.querySelector('a.document-download[href]');
            if (!a) continue;
            const href = a.href || '';
            if (!href || !href.includes('widen.net')) continue;
            const title = (article.querySelector('h5')?.textContent || '').trim()
              || href.split('/').pop() || '';
            const rawType = (
              article.querySelector('.document-category')?.textContent || ''
            ).trim() || null;
            const date = article.querySelector('time')?.getAttribute('datetime') || null;
            const size = (
              article.querySelector('.document-file-size')?.textContent || ''
            ).trim() || null;
            const langs = (
              article.querySelector('.document-language')?.innerText || ''
            ).replace(/\\s+/g, ' ').trim() || null;
            const thumb = article.querySelector(
              '.document-image img'
            )?.getAttribute('src') || null;
            cards.push({
              file_url: href,
              title,
              raw_asset_type: rawType,
              release_date: date,
              file_size: size,
              languages: langs,
              thumbnail_image: thumb,
            });
          }
          return cards;
        }"""
    )


def count_download_cards(page) -> int:
    return int(
        page.evaluate(
            "() => document.querySelectorAll('article a.document-download').length"
        )
        or 0
    )


def has_load_more(page) -> bool:
    return bool(
        page.evaluate(
            """() => !![...document.querySelectorAll('a')].find(a =>
              /carica altro|load more/i.test((a.textContent || '').trim())
            )"""
        )
    )


def click_load_more(page) -> bool:
    return bool(
        page.evaluate(
            """() => {
              const a = [...document.querySelectorAll('a')].find(el =>
                /carica altro|load more/i.test((el.textContent || '').trim())
              );
              if (!a) return false;
              a.scrollIntoView({block: 'center'});
              a.click();
              return true;
            }"""
        )
    )


def card_to_row(
    card: dict[str, Any],
    source_id: str,
    now_iso: str,
) -> dict[str, Any] | None:
    raw_href = (card.get("file_url") or "").strip()
    if not raw_href:
        return None
    file_url = canonical_file_url(raw_href)
    parsed = urllib.parse.urlparse(file_url)
    title = (card.get("title") or "").strip() or Path(parsed.path).name
    raw_asset = card.get("raw_asset_type")
    asset_type = normalize_asset_type(str(raw_asset) if raw_asset else None)
    dam_stem = Path(parsed.path).stem
    # Stesso schema slug di Sirona: {source}-{stem}-{hash8(file_url)}
    slug = f"{SOURCE_SLUG}-{slugify(dam_stem)}-{short_hash(file_url)}"

    thumb = card.get("thumbnail_image")
    if isinstance(thumb, str) and thumb.startswith("/"):
        thumb = urllib.parse.urljoin(SITE_ORIGIN, thumb)

    search_bits = [title, str(raw_asset or ""), file_url]
    search_payload = " ".join(b for b in search_bits if b).strip()

    # Chiavi allineate a dentsply_sirona_scraper (consumate da /docs via parseOther)
    other: dict[str, Any] = {
        "raw_asset_type": raw_asset,
        "source_page_url": LISTING_URL,
        "thumbnail_image": thumb,
        "search_payload": search_payload,
        "target": None,
        "primary_tag": raw_asset,
        "pill_color": None,
        "download_button_label": "Scaricare",
        "details_button_label": None,
        "search_text": search_payload,
        "dam_path": parsed.path,
        "filter_tag": None,
        "filter_label": raw_asset,
        "locale": "it",
        # Extra Kerr (ignorati da parseOther / DocView; utili in DB)
        "release_date": card.get("release_date"),
        "file_size": card.get("file_size"),
        "languages": card.get("languages"),
    }

    return {
        "source_id": source_id,
        "slug": slug,
        "title": title,
        "description": None,
        "asset_type": asset_type,
        "file_url": file_url,
        "product_name": None,
        "last_seen_at": now_iso,
        "is_active": True,
        "updated_at": now_iso,
        "other": other,
    }


def launch_browser(p, *, headless: bool):
    launch_args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
    ]
    launch_errors: list[str] = []
    for channel in ("chrome", "msedge", None):
        try:
            kwargs: dict[str, Any] = {
                "headless": headless,
                "args": launch_args,
                "ignore_default_args": ["--enable-automation"],
            }
            if channel:
                kwargs["channel"] = channel
            browser = p.chromium.launch(**kwargs)
            log(f"Browser avviato channel={channel or 'chromium'} headless={headless}")
            return browser
        except Exception as e:
            launch_errors.append(f"{channel or 'chromium'}: {type(e).__name__}: {e}")
    raise RuntimeError("Impossibile avviare browser. " + " | ".join(launch_errors))


def wait_for_card_growth(page, before: int, *, timeout_ms: int) -> int:
    """Attende che il DOM abbia più card di `before` (AJAX load-more è lento)."""
    deadline = time.monotonic() + (timeout_ms / 1000.0)
    while time.monotonic() < deadline:
        now = count_download_cards(page)
        if now > before:
            return now
        page.wait_for_timeout(150)
    return count_download_cards(page)


def load_all_via_load_more(
    page,
    *,
    expected_total: int | None,
    max_load_more: int,
    settle_ms: int,
    max_docs: int | None,
) -> dict[str, Any]:
    """Click 'Carica altro' finché non ci sono più card nuove o finisce il pager."""
    stagnant = 0
    clicks = 0
    last_count = count_download_cards(page)
    # Timeout crescita: settle_ms è un floor; AJAX Kerr spesso >1s
    growth_timeout_ms = max(settle_ms * 4, 5000)
    log(f"Card iniziali nel DOM: {last_count} | growth_timeout={growth_timeout_ms}ms")

    while clicks < max_load_more:
        if max_docs is not None and last_count >= max_docs:
            log(f"Stop soft max_docs={max_docs} (card DOM={last_count})")
            break
        if expected_total is not None and last_count >= expected_total:
            log(f"Raggiunto expected_total={expected_total}")
            break
        if not has_load_more(page):
            log("Nessun 'Carica altro' → fine paginazione")
            break

        before = last_count
        clicks += 1
        try:
            with page.expect_response(
                lambda r: "views/ajax" in r.url and r.request.method == "POST",
                timeout=growth_timeout_ms,
            ):
                if not click_load_more(page):
                    log("Click load-more fallito")
                    clicks -= 1
                    break
        except PlaywrightTimeoutError:
            # Response già passata o lenta: click se non partito, poi attendi DOM
            if count_download_cards(page) <= before:
                click_load_more(page)

        last_count = wait_for_card_growth(
            page, before, timeout_ms=growth_timeout_ms
        )
        if last_count <= before:
            stagnant += 1
            log(
                f"Load-more #{clicks}: ancora {last_count} card "
                f"(stagnant={stagnant}/3)"
            )
            if stagnant >= 3:
                log("3 load-more senza progresso → stop")
                break
            continue

        delta = last_count - before
        stagnant = 0
        if clicks == 1 or clicks % 10 == 0:
            suffix = f" / {expected_total}" if expected_total else ""
            log(f"Load-more #{clicks}: +{delta} → {last_count} card{suffix}")

    return {"clicks": clicks, "dom_cards": last_count}


def run(config: dict[str, Any]) -> dict[str, Any]:
    headless = bool(config.get("headless", DEFAULT_HEADLESS))
    max_load_more = int(config.get("max_load_more", DEFAULT_MAX_LOAD_MORE))
    settle_ms = int(config.get("settle_ms", DEFAULT_SETTLE_MS))
    min_ratio = float(config.get("min_completeness_ratio", DEFAULT_MIN_RATIO))
    do_upsert = bool(config.get("upsert", DEFAULT_UPSERT))
    max_docs = config.get("max_docs")
    max_docs_i = int(max_docs) if max_docs is not None else None
    out_name = str(config.get("out_json") or DEFAULT_OUT_JSON)
    out_path = Path(__file__).resolve().parent / out_name

    log("=== Avvio Kerr Dental Download Center (IT) ===")
    log(
        f"headless={headless} max_load_more={max_load_more} "
        f"settle_ms={settle_ms} min_ratio={min_ratio} max_docs={max_docs_i} "
        f"upsert={do_upsert}"
    )

    try:
        test = supabase.table(TABLE_DOCS).select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test: {len(test.data or [])} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    source_id = ensure_source()
    log(f"document_sources slug={SOURCE_SLUG} id={source_id}")

    t0 = time.monotonic()
    catalog_total: int | None = None
    facets: list[dict[str, Any]] = []
    cards_raw: list[dict[str, Any]] = []
    load_meta: dict[str, Any] = {}

    with sync_playwright() as p:
        browser = launch_browser(p, headless=headless)
        context = browser.new_context(
            user_agent=USER_AGENT,
            locale="it-IT",
            viewport={"width": 1440, "height": 900},
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = context.new_page()
        page.set_default_timeout(NAV_TIMEOUT_MS)
        try:
            log(f"Apro listing: {LISTING_URL}")
            page.goto(LISTING_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
            dismiss_overlays(page)
            wait_listing_ready(page)
            dismiss_overlays(page)

            catalog_total = extract_total_available(page)
            facets = extract_doc_type_facets(page)
            log(f"Catalogo disponibili={catalog_total} | facet tipi={len(facets)}")
            if not catalog_total and not facets:
                raise RuntimeError("Listing senza totale né facet")

            load_meta = load_all_via_load_more(
                page,
                expected_total=catalog_total,
                max_load_more=max_load_more,
                settle_ms=settle_ms,
                max_docs=max_docs_i,
            )
            cards_raw = extract_cards(page)
            log(f"Card parse finali: {len(cards_raw)}")
        finally:
            context.close()
            browser.close()

    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []
    for card in cards_raw:
        row = card_to_row(card, source_id, now_iso)
        if not row:
            continue
        file_url = row["file_url"]
        if file_url in seen:
            continue
        seen.add(file_url)
        rows.append(row)
        if max_docs_i is not None and len(rows) >= max_docs_i:
            break

    total_upserted = 0
    if do_upsert and rows:
        log(f"Upsert {len(rows)} documenti su {TABLE_DOCS}...")
        total_upserted = upsert_batches(rows, session_total=0)
    elif not do_upsert:
        log("Upsert disabilitato (dry-run)")

    raw_counts: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    for row in rows:
        raw = (row.get("other") or {}).get("raw_asset_type") or "(missing)"
        raw_counts[str(raw)] = raw_counts.get(str(raw), 0) + 1
        at = row.get("asset_type") or "other"
        type_counts[at] = type_counts.get(at, 0) + 1

    facet_compare: list[dict[str, Any]] = []
    for facet in sorted(
        facets, key=lambda f: int(f.get("expected") or 0), reverse=True
    ):
        label = str(facet.get("label") or "")
        expected = facet.get("expected")
        got = raw_counts.get(label, 0)
        ratio = (got / expected) if expected else None
        facet_compare.append(
            {
                "label": label,
                "expected": expected,
                "got_raw_label": got,
                "ratio": ratio,
                "ok": bool(expected is not None and got >= int(expected)),
            }
        )

    elapsed = time.monotonic() - t0
    global_ratio = (len(rows) / catalog_total) if catalog_total else None
    half_ok = bool(catalog_total and len(rows) >= catalog_total * 0.5)
    full_ok = bool(
        catalog_total and global_ratio is not None and global_ratio >= min_ratio
    )
    missing_category = raw_counts.get("(missing)", 0)

    summary = {
        "source": {
            "slug": SOURCE_SLUG,
            "name": SOURCE_NAME,
            "domain": SOURCE_DOMAIN,
            "listing_url": LISTING_URL,
            "id": source_id,
        },
        "catalog_total_available": catalog_total,
        "unique_collected": len(rows),
        "upserted": total_upserted,
        "dom_cards_parsed": len(cards_raw),
        "global_ratio": global_ratio,
        "half_catalog_ok": half_ok,
        "full_catalog_ok": full_ok,
        "missing_category_cards": missing_category,
        "load_more": load_meta,
        "facet_compare": facet_compare,
        "raw_asset_type_breakdown": dict(
            sorted(raw_counts.items(), key=lambda x: -x[1])
        ),
        "asset_type_breakdown": dict(
            sorted(type_counts.items(), key=lambda x: -x[1])
        ),
        "elapsed_sec": round(elapsed, 2),
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
        "db_upsert": do_upsert,
    }

    payload = {**summary, "sample_documents": rows[:5]}
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    ratio_s = f"{global_ratio:.3f}" if global_ratio is not None else "n/a"
    log(
        f"FATTO unique={len(rows)} upserted={total_upserted} catalog={catalog_total} "
        f"global_ratio={ratio_s} half_ok={half_ok} full_ok={full_ok} | "
        f"{elapsed:.1f}s"
    )
    log(f"Output JSON: {out_path}")
    if type_counts:
        log("Breakdown asset_type:")
        for label, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            log(f"  {count:5d}  {label}")

    gaps = [
        f
        for f in facet_compare
        if f.get("expected") and (f.get("got_raw_label") or 0) < int(f["expected"])
    ]
    if gaps:
        log(f"Facet con undercount (card senza category tipiche): {len(gaps)}")
        for g in gaps[:12]:
            log(f"  {g['got_raw_label']}/{g['expected']}  {g['label']}")

    return summary


def prompt_config() -> dict[str, Any]:
    print()
    print("Kerr Dental scraper. Opzioni:")
    print('  Invio / "y" → full catalog + upsert DB')
    print("  dry        → full senza upsert")
    print("  headed     → browser visibile + upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True}
        if raw == "dry":
            return {"upsert": False}
        if raw == "headed":
            return {"headless": False, "upsert": True}
        print("Invio, dry, o headed.")


def main() -> None:
    config_path = parse_config_path()
    if config_path is not None:
        cfg = load_config(config_path)
        summary = run(cfg)
    else:
        require_interactive_tty(
            "python app/lib/scraping/manufacturer_docs/kerr_dental_scraper.py"
        )
        cfg = prompt_config()
        summary = run(cfg)

    if summary.get("full_catalog_ok") or summary.get("half_catalog_ok"):
        sys.exit(0)
    sys.exit(2)


if __name__ == "__main__":
    main()
