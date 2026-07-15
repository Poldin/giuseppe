import html
import json
import os
import re
import sys
import time
import random
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client, Client

from scrape_session import prompt_run_mode, prompt_session_id

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
ECOMMERCE_ID = "a727d20e-b206-4e50-8d28-a9d468e41cc3"
SITE_ORIGIN = "https://www.dontalia.it"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ROUTES: dict[str, dict[str, str]] = {
    "studio": {
        "label": "STUDIO",
        "base_url": f"{SITE_ORIGIN}/studio.html",
        "main_family": "Studio",
    },
    "laboratorio": {
        "label": "LABORATORIO",
        "base_url": f"{SITE_ORIGIN}/laboratorio.html",
        "main_family": "Laboratorio",
    },
    "apparecchiatura": {
        "label": "APPARECCHIATURA",
        "base_url": f"{SITE_ORIGIN}/apparecchiatura.html",
        "main_family": "Apparecchiatura",
    },
    "ortodonzia": {
        "label": "ORTODONZIA",
        "base_url": f"{SITE_ORIGIN}/ortodonzia.html",
        "main_family": "Ortodonzia",
    },
}

CATALOG_LIST_SELECTOR = ".products-catalog__list .product-card"

MAX_PAGES_PER_ROUTE = 5000


def build_catalog_url(base_url: str, page_number: int, main_family: str) -> str:
    query = urlencode(
        {
            "p": str(page_number),
            "limit": "24",
            "orderBy[bestseller]": "asc",
            "filters[main_family]": main_family,
        }
    )
    return f"{base_url}?{query}"


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def prompt_yes_no(message: str, *, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{message} [{hint}] ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return True if raw != "" or default else False
        if raw in ("n", "no"):
            return False
        print('Rispondi "y" (sì) o "n" (no).')


def prompt_start_page() -> int:
    print()
    print("Da quale pagina vuoi partire?")
    print('  Invio / "y" → pagina 1, poi continua finché non trova una pagina vuota')
    print("  Numero N    → pagina N, poi continua finché non trova una pagina vuota")

    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return 1
        if re.fullmatch(r"\d+", raw):
            page = int(raw)
            if page >= 1:
                return page
            print("Inserisci un numero >= 1.")
            continue
        print("Inserisci un numero >= 1 oppure Invio per partire da 1.")


def dismiss_cookie_banner(page, page_number: int, route_label: str) -> None:
    button_selectors = [
        "button:has-text('Accetta tutti i cookie')",
        "button:has-text('Accetta tutti')",
        "button:has-text('Accetta')",
        "button:has-text('Accept all')",
        "[id*='cookie'] button",
        "[class*='cookie'] button",
    ]

    for selector in button_selectors:
        buttons = page.locator(selector)
        if buttons.count() == 0 or not buttons.first.is_visible():
            continue
        try:
            buttons.first.click(timeout=3000)
            time.sleep(0.5)
            log(f"[{route_label}] Pagina {page_number}: banner cookie chiuso ({selector})")
            return
        except Exception:
            continue


def parse_price(price_str: str | None) -> float | None:
    if not price_str:
        return None

    cleaned = str(price_str).replace("€", "").replace("\xa0", " ").strip()
    if not cleaned:
        return None

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(" ", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_gtm_payload(onclick: str) -> dict | None:
    marker = "setGoogleTagManagerProductClick("
    start = onclick.find(marker)
    if start < 0:
        return None

    index = start + len(marker)
    while index < len(onclick) and onclick[index].isspace():
        index += 1
    if index >= len(onclick) or onclick[index] != "{":
        return None

    depth = 0
    end = index
    in_string = False
    escape = False
    while end < len(onclick):
        char = onclick[end]
        if escape:
            escape = False
        elif char == "\\":
            escape = True
        elif char == '"':
            in_string = not in_string
        elif not in_string:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end += 1
                    break
        end += 1

    try:
        return json.loads(html.unescape(onclick[index:end]))
    except json.JSONDecodeError:
        return None


def parse_price_from_dom(card) -> float | None:
    price_root = card.select_one(".product-card__regular-price")
    if price_root:
        integer_el = price_root.select_one(".integer-part")
        if integer_el:
            decimal_el = price_root.select_one(".decimal-part")
            combined = integer_el.get_text("", strip=True)
            if decimal_el:
                combined += decimal_el.get_text("", strip=True)
            parsed = parse_price(combined)
            if parsed is not None:
                return parsed
        parsed = parse_price(price_root.get_text(" ", strip=True))
        if parsed is not None:
            return parsed

    card_text = card.get_text(" ", strip=True)
    from_match = re.search(r"Da\s+([\d.,]+)\s*€", card_text)
    if from_match:
        return parse_price(from_match.group(1))

    only_match = re.search(r"A soli\s+([\d.,]+)\s*€", card_text, flags=re.IGNORECASE)
    if only_match:
        return parse_price(only_match.group(1))

    return None


def parse_old_price_from_dom(card) -> float | None:
    old_el = card.select_one(".product-card__final-price-with-save")
    if old_el:
        return parse_price(old_el.get_text(" ", strip=True))
    return None


def build_product_url(href: str | None, payload: dict | None) -> str | None:
    path = ""
    if payload and payload.get("url"):
        path = str(payload["url"]).strip().lstrip("/")
    elif href:
        path = href.strip().lstrip("/")

    if not path:
        return None
    return f"{SITE_ORIGIN}/{path}"


def find_products(soup: BeautifulSoup) -> list:
    return soup.select(CATALOG_LIST_SELECTOR)


def parse_product_card(card, page_number: int) -> dict | None:
    link = card.select_one("a.product-card__product-link")
    if not link:
        return None

    payload = extract_gtm_payload(link.get("onclick", ""))
    href = link.get("href", "").strip() or link.get("data-url", "").strip()

    sku = str(payload.get("sku")).strip() if payload and payload.get("sku") else None
    product_name = None
    if payload and payload.get("name"):
        product_name = str(payload["name"]).strip()
    if not product_name:
        product_name = link.get_text(" ", strip=True) or link.get("aria-label", "").strip()

    product_url = build_product_url(href, payload)
    brand = str(payload.get("brand")).strip() if payload and payload.get("brand") else None

    final_price = None
    old_price = None
    if payload:
        final_price = parse_price(
            payload.get("specialPrice")
            or payload.get("minimumPrice")
            or payload.get("minRegularPrice")
        )
        old_price = parse_price(payload.get("regularPrice") or payload.get("minRegularPrice"))

    if final_price is None:
        final_price = parse_price_from_dom(card)
    if old_price is None:
        old_price = parse_old_price_from_dom(card)

    discount = None
    if payload and payload.get("savePercent") is not None:
        try:
            discount = float(payload["savePercent"])
        except (TypeError, ValueError):
            discount = None
    elif old_price and final_price and old_price > final_price:
        discount = round(((old_price - final_price) / old_price) * 100, 2)

    if not sku or not product_name or final_price is None or not product_url:
        return None

    return {
        "product_name": product_name,
        "final_price": final_price,
        "product_url": product_url,
        "id_ecommerce": sku,
        "old_price": old_price,
        "discount": discount,
        "brand": brand,
        "source_page": page_number,
    }


def scrape_page(
    page_number: int,
    route_label: str,
    base_url: str,
    main_family: str,
) -> str | None:
    url = build_catalog_url(base_url, page_number, main_family)
    log(f"[{route_label}] Pagina {page_number}: avvio browser -> {url}")

    with sync_playwright() as p:
        log(f"[{route_label}] Pagina {page_number}: lancio Chromium...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="it-IT",
        )
        page = context.new_page()

        try:
            log(f"[{route_label}] Pagina {page_number}: navigazione in corso (timeout 90s)...")
            page.goto(url, wait_until="domcontentloaded", timeout=90000)
            log(f"[{route_label}] Pagina {page_number}: pagina caricata, titolo: {page.title()!r}")

            dismiss_cookie_banner(page, page_number, route_label)
            page.wait_for_selector(CATALOG_LIST_SELECTOR, timeout=45000)
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1.0)

            html = page.content()
            card_count = page.locator(CATALOG_LIST_SELECTOR).count()
            log(
                f"[{route_label}] Pagina {page_number}: HTML scaricato "
                f"({len(html):,} caratteri, {card_count} card nel catalogo)"
            )
        except Exception as e:
            log(
                f"[{route_label}] Pagina {page_number}: "
                f"ERRORE scraping -> {type(e).__name__}: {e!s}"
            )
            html = None
        finally:
            browser.close()
            log(f"[{route_label}] Pagina {page_number}: browser chiuso")

    return html


def parse_and_save(
    html_content: str | None,
    page_number: int,
    session_id: str,
    route_label: str,
) -> int | None:
    if not html_content:
        log(f"[{route_label}] Pagina {page_number}: nessun HTML, salto salvataggio")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    product_cards = find_products(soup)

    if not product_cards:
        log(
            f"[{route_label}] Pagina {page_number}: 0 prodotti trovati "
            f"(selettore {CATALOG_LIST_SELECTOR})"
        )
        return -1

    log(f"[{route_label}] Pagina {page_number}: trovati {len(product_cards)} prodotti")

    batch_data = []
    skipped = 0
    duplicate_ids = 0
    seen_ids: set[str] = set()

    for card in product_cards:
        try:
            parsed = parse_product_card(card, page_number)
            if not parsed:
                skipped += 1
                continue

            id_ecommerce = parsed["id_ecommerce"]
            if id_ecommerce in seen_ids:
                duplicate_ids += 1
                continue
            seen_ids.add(id_ecommerce)

            record = {
                "product_name": parsed["product_name"],
                "final_price": parsed["final_price"],
                "ecommerce_id": ECOMMERCE_ID,
                "id_ecommerce": id_ecommerce,
                "discount": parsed["discount"],
                "brand": parsed["brand"],
                "update_at": datetime.now(timezone.utc).isoformat(),
                "update_session_id": session_id,
                "is_escluded": False,
                "other": {
                    "original_url": parsed["product_url"],
                    "source_page": parsed["source_page"],
                    "source_section": route_label,
                    "old_price_list": parsed["old_price"],
                },
            }
            batch_data.append(record)

        except Exception as e:
            skipped += 1
            log(
                f"[{route_label}] Pagina {page_number}: "
                f"errore parsing prodotto -> {type(e).__name__}: {e}"
            )

    log(
        f"[{route_label}] Pagina {page_number}: {len(batch_data)} prodotti validi, "
        f"{skipped} scartati, {duplicate_ids} duplicati sku"
    )

    if batch_data:
        try:
            log(
                f"[{route_label}] Pagina {page_number}: "
                f"upsert su Supabase ({len(batch_data)} record)..."
            )
            response = supabase.table("scraped_product").upsert(
                batch_data,
                on_conflict="ecommerce_id,id_ecommerce",
            ).execute()
            saved = len(response.data) if response.data else len(batch_data)
            log(f"[{route_label}] Pagina {page_number}: upsert OK ({saved} record)")
        except Exception as e:
            log(
                f"[{route_label}] Pagina {page_number}: "
                f"ERRORE database -> {type(e).__name__}: {e}"
            )
    else:
        log(f"[{route_label}] Pagina {page_number}: nessun record da salvare")
        return -1

    return 0


def run_route(
    route_key: str,
    *,
    session_id: str | None = None,
    start_page: int | None = None,
) -> None:
    route = ROUTES[route_key]
    label = route["label"]
    base_url = route["base_url"]
    main_family = route["main_family"]

    print()
    print(f"=== Configurazione rotta {label} ===")
    print(f"URL base: {base_url}")
    print("Le pagine verranno scrapate in automatico finché non se ne trova una vuota.")

    if start_page is None:
        start_page = prompt_start_page()

    if session_id is None:
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, f"Dontalia {label}")

    log(f"[{label}] Partenza da pagina {start_page}")
    log(f"[{label}] Session ID: {session_id}")

    page_number = start_page
    pages_scraped = 0

    while page_number <= MAX_PAGES_PER_ROUTE:
        log(f"[{label}] --- Inizio pagina {page_number} ---")

        html = scrape_page(page_number, label, base_url, main_family)
        result = parse_and_save(html, page_number, session_id, label)

        if result == -1:
            log(f"[{label}] Pagina {page_number}: nessun prodotto, fine rotta")
            break

        if result is None:
            log(f"[{label}] Pagina {page_number}: errore scraping, stop rotta")
            break

        pages_scraped += 1
        page_number += 1

        pause = random.uniform(2.5, 5.0)
        log(f"[{label}] Pagina {page_number - 1}: pausa {pause:.1f}s prima della prossima")
        time.sleep(pause)

    if page_number > MAX_PAGES_PER_ROUTE:
        log(f"[{label}] Limite sicurezza {MAX_PAGES_PER_ROUTE} pagine raggiunto, stop")

    log(f"=== Rotta {label} completata ({pages_scraped} pagine con dati) ===")


if __name__ == "__main__":
    log("=== Avvio dontalia_local_scraper ===")
    log(f"Supabase URL: {SUPABASE_URL}")
    log(f"Ecommerce ID: {ECOMMERCE_ID}")
    for route_key, route in ROUTES.items():
        log(f"Rotta {route['label']}: {route['base_url']}")

    try:
        test = supabase.table("scraped_product").select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test query: {len(test.data)} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    if not sys.stdin.isatty():
        print()
        print("Questo script chiede input interattivo (rotte, pagina di partenza, session ID).")
        print("Non puoi rispondere dalla scheda Output / Code Runner.")
        print()
        print("Apri il Terminale integrato (Ctrl+`) e lancia:")
        print("  python app/lib/scraping/dontalia_local_scraper.py")
        print()
        sys.exit(1)

    print()
    mode = prompt_run_mode()

    if mode == "direct":
        selected_routes = list(ROUTES.keys())
        log(
            "Modalità diretta: rotte "
            f"{', '.join(ROUTES[key]['label'] for key in selected_routes)}"
        )
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, "Dontalia")
        start_page = 1
        log("Modalità diretta: partenza da pagina 1 per tutte le rotte")
    else:
        print()
        print("Quali rotte Dontalia vuoi eseguire?")
        run_studio = prompt_yes_no("Eseguire la rotta STUDIO?")
        run_laboratorio = prompt_yes_no("Eseguire la rotta LABORATORIO?")
        run_apparecchiatura = prompt_yes_no("Eseguire la rotta APPARECCHIATURA?")
        run_ortodonzia = prompt_yes_no("Eseguire la rotta ORTODONZIA?")

        selected_routes = []
        if run_studio:
            selected_routes.append("studio")
        if run_laboratorio:
            selected_routes.append("laboratorio")
        if run_apparecchiatura:
            selected_routes.append("apparecchiatura")
        if run_ortodonzia:
            selected_routes.append("ortodonzia")

        if not selected_routes:
            log("Nessuna rotta selezionata, esco.")
            sys.exit(0)

        session_id = None
        start_page = None

    for index, route_key in enumerate(selected_routes, start=1):
        if index > 1:
            print()
            print(f"--- Prossima rotta: {ROUTES[route_key]['label']} ---")
        run_route(
            route_key,
            session_id=session_id,
            start_page=start_page,
        )

    log("=== Scraping Dontalia completato ===")
