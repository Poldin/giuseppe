import os
import sys
import time
import random
import re
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client, Client

from scrape_session import prompt_session_id
from scrape_pages import prompt_page_plan, prompt_total_pages, resolve_pages

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
ECOMMERCE_ID = "c638b9c6-ade8-4593-a9df-250d0e961cf4"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

CATALOG_ORDER = "manufacturer-sort"

ROUTES: dict[str, dict[str, str]] = {
    "studio": {
        "label": "STUDIO",
        "base_url": "https://www.gerho.it/STUDIO/",
    },
    "laboratorio": {
        "label": "LABORATORIO",
        "base_url": "https://www.gerho.it/LABORATORIO/",
    },
}


def build_catalog_url(base_url: str, page_number: int) -> str:
    if page_number <= 1:
        return base_url
    return f"{base_url}?order={CATALOG_ORDER}&p={page_number}"


def prompt_yes_no(message: str, *, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{message} [{hint}] ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return True if raw != "" or default else False
        if raw in ("n", "no"):
            return False
        print('Rispondi "y" (sì) o "n" (no).')


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def dismiss_overlays(page, page_number: int) -> None:
    terms_modal = page.locator(".modal.show, .modal.in, .modal[style*='display: block']")
    if terms_modal.count() > 0 and terms_modal.first.is_visible():
        log(f"Pagina {page_number}: modal termini rilevato")
        for selector in [".modal-footer button", ".modal-footer a", ".modal button.btn-primary"]:
            btn = page.locator(selector).first
            if btn.count() > 0 and btn.is_visible():
                try:
                    btn.click(timeout=3000)
                    time.sleep(0.3)
                    log(f"Pagina {page_number}: modal termini chiuso ({selector})")
                    break
                except Exception:
                    pass

    dismiss_cookie_banner(page, page_number)


def dismiss_cookie_banner(page, page_number: int) -> None:
    container = page.locator("[data-cookie-permission='true'], .cookie-permission-container")
    if container.count() == 0 or not container.first.is_visible():
        return

    log(f"Pagina {page_number}: banner cookie rilevato")
    button_selectors = [
        "button:has-text('Accetta tutti i cookie')",
        "button:has-text('Accetta')",
        ".cookie-permission-container button",
        "[data-cookie-permission] button",
        ".cookie-container button.btn",
    ]

    for selector in button_selectors:
        buttons = page.locator(selector)
        if buttons.count() == 0 or not buttons.first.is_visible():
            continue
        button = buttons.first
        try:
            log(f"Pagina {page_number}: clicco pulsante cookie ({selector})")
            button.click(timeout=5000)
            time.sleep(0.5)
            if not container.first.is_visible():
                log(f"Pagina {page_number}: banner cookie chiuso")
                return
        except Exception as e:
            log(f"Pagina {page_number}: click cookie fallito ({selector}) -> {type(e).__name__}")

    log(f"Pagina {page_number}: rimuovo banner cookie via JavaScript")
    page.evaluate(
        "document.querySelector('[data-cookie-permission], .cookie-permission-container')?.remove()"
    )
    time.sleep(0.3)


def parse_prices_from_column(price_col) -> tuple[float | None, float | None]:
    if not price_col:
        return None, None

    price_values: list[float] = []
    for el in price_col.select(
        ".product-price, .price, .list-price-price, .sale-price, .order-item-price-value"
    ):
        parsed = parse_price(el.get_text())
        if parsed is not None:
            price_values.append(parsed)

    if not price_values:
        for match in re.finditer(r"[\d.]+\,\d{2}\s*€|[\d.]+\.\d{2}\s*€", price_col.get_text(" ", strip=True)):
            parsed = parse_price(match.group())
            if parsed is not None:
                price_values.append(parsed)

    if not price_values:
        return None, None
    if len(price_values) == 1:
        return price_values[0], None

    final_price = min(price_values)
    old_price = max(price_values)
    return final_price, old_price if old_price > final_price else None


def find_studio_products(soup):
    listing = soup.select_one(".cms-element-product-listing")
    if not listing:
        return []
    return listing.select(".order-table-body .order-wrapper")


def parse_studio_item(item):
    sku_el = item.select_one(".order-item-number")
    sku = sku_el.get_text(strip=True) if sku_el else None

    name_col = item.select_one(".order-item-header .ps-2.ps-md-0")
    name_el = name_col.select_one("a") if name_col else item.select_one(".order-item-header a")
    product_name = name_el.get_text(" ", strip=True) if name_el else None
    product_url = name_el.get("href") if name_el and name_el.has_attr("href") else None
    if product_url and product_url.startswith("/"):
        product_url = f"https://www.gerho.it{product_url}"

    if not product_name and name_col:
        product_name = name_col.get_text(" ", strip=True)

    price_col = item.select_one(".order-item-price")
    final_price, old_price = parse_prices_from_column(price_col)

    discount = None
    discount_el = item.select_one(".order-item-price .badge, .order-item-price .discount-badge")
    if discount_el:
        discount_match = re.search(r"(\d+(?:[.,]\d+)?)\s*%", discount_el.get_text())
        if discount_match:
            discount = float(discount_match.group(1).replace(",", "."))
    elif old_price and final_price and old_price > final_price:
        discount = round(((old_price - final_price) / old_price) * 100, 2)

    return {
        "sku": sku,
        "product_name": product_name,
        "product_url": product_url,
        "final_price": final_price,
        "old_price": old_price,
        "discount": discount,
    }


def parse_price(price_str):
    if not price_str:
        return None
    cleaned = price_str.replace("€", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None

def scrape_page(page_number: int, route_label: str, base_url: str):
    url = build_catalog_url(base_url, page_number)
    log(f"[{route_label}] Pagina {page_number}: avvio browser -> {url}")

    with sync_playwright() as p:
        log(f"[{route_label}] Pagina {page_number}: lancio Chromium...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Chrome/120.0.0.0)",
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        try:
            log(f"[{route_label}] Pagina {page_number}: navigazione in corso (timeout 60s)...")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            log(f"[{route_label}] Pagina {page_number}: pagina caricata, titolo: {page.title()!r}")

            dismiss_overlays(page, page_number)
            page.wait_for_selector(
                ".cms-element-product-listing .order-wrapper",
                timeout=30000,
            )

            html = page.content()
            log(f"[{route_label}] Pagina {page_number}: HTML scaricato ({len(html):,} caratteri)")
        except Exception as e:
            log(f"[{route_label}] Pagina {page_number}: ERRORE scraping -> {type(e).__name__}: {e!s}")
            html = None
        finally:
            browser.close()
            log(f"[{route_label}] Pagina {page_number}: browser chiuso")

    return html


def parse_and_save(
    html_content,
    page_number: int,
    session_id: str,
    route_label: str,
) -> int | None:
    if not html_content:
        log(f"[{route_label}] Pagina {page_number}: nessun HTML, salto salvataggio")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    product_items = find_studio_products(soup)

    if not product_items:
        log(
            f"[{route_label}] Pagina {page_number}: 0 prodotti trovati "
            "(selettore .cms-element-product-listing .order-wrapper)"
        )
        return -1

    log(
        f"[{route_label}] Pagina {page_number}: "
        f"trovati {len(product_items)} prodotti nella tabella"
    )

    batch_data = []
    skipped = 0
    duplicate_ids = 0
    seen_ids: set[str] = set()

    for item in product_items:
        try:
            parsed = parse_studio_item(item)
            sku = parsed["sku"]
            product_name = parsed["product_name"]
            product_url = parsed["product_url"]
            final_price = parsed["final_price"]
            old_price = parsed["old_price"]
            discount = parsed["discount"]

            if not sku or not product_name or final_price is None:
                skipped += 1
                continue

            if sku in seen_ids:
                duplicate_ids += 1
                continue
            seen_ids.add(sku)

            record = {
                "product_name": product_name,
                "final_price": final_price,
                "ecommerce_id": ECOMMERCE_ID,
                "id_ecommerce": sku,
                "discount": discount,
                "update_at": datetime.now(timezone.utc).isoformat(),
                "update_session_id": session_id,
                "is_escluded": False,
                "other": {
                    "original_url": product_url,
                    "source_page": page_number,
                    "source_section": route_label,
                    "old_price_list": old_price,
                },
            }
            batch_data.append(record)

        except Exception as e:
            skipped += 1
            log(
                f"[{route_label}] Pagina {page_number}: "
                f"errore parsing singolo prodotto -> {type(e).__name__}: {e}"
            )
            continue

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
                on_conflict="ecommerce_id,id_ecommerce"
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

    return 0


def run_route(route_key: str) -> None:
    route = ROUTES[route_key]
    label = route["label"]
    base_url = route["base_url"]

    print()
    print(f"=== Configurazione rotta {label} ===")
    print(f"URL base: {base_url}")

    page_plan = prompt_page_plan()
    total_pages: int | None = None
    if page_plan.mode == "range":
        total_pages = prompt_total_pages(base_url)

    try:
        pages_to_scrape = resolve_pages(page_plan, total_pages)
    except ValueError as exc:
        log(f"[{label}] Configurazione pagine non valida: {exc}")
        sys.exit(1)

    session_id = prompt_session_id(supabase, ECOMMERCE_ID, f"Gerhò {label}")

    if page_plan.mode == "list":
        log(f"[{label}] Pagine specifiche: {pages_to_scrape}")
    else:
        log(
            f"[{label}] Pagine {page_plan.start_page} → {total_pages} "
            f"(totale {len(pages_to_scrape)})"
        )
    log(f"[{label}] Session ID: {session_id}")

    for index, page in enumerate(pages_to_scrape, start=1):
        if page > 1000:
            log(f"[{label}] Limite sicurezza 1000 pagine raggiunto, stop")
            break

        if page_plan.mode == "list":
            log(f"[{label}] --- Inizio pagina {page} ({index}/{len(pages_to_scrape)}) ---")
        else:
            log(f"[{label}] --- Inizio pagina {page}/{total_pages} ---")

        html = scrape_page(page, label, base_url)
        result = parse_and_save(html, page, session_id, label)

        if result == -1:
            log(f"[{label}] Pagina {page}: nessun prodotto, stop")
            break

        if index < len(pages_to_scrape):
            pause = random.uniform(2.5, 5.0)
            log(f"[{label}] Pagina {page}: pausa {pause:.1f}s prima della prossima")
            time.sleep(pause)

    log(f"=== Rotta {label} completata ===")


if __name__ == "__main__":
    log("=== Avvio gerho_local_scraper ===")
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
        print("Questo script chiede input interattivo (rotte, pagine, session ID).")
        print("Non puoi rispondere dalla scheda Output / Code Runner.")
        print()
        print("Apri il Terminale integrato (Ctrl+`) e lancia:")
        print("  python app/lib/scraping/gerho_local_scraper.py")
        print()
        sys.exit(1)

    print()
    print("Quali rotte Gerhò vuoi eseguire?")
    run_studio = prompt_yes_no("Eseguire la rotta STUDIO?")
    run_laboratorio = prompt_yes_no("Eseguire la rotta LABORATORIO?")

    selected_routes: list[str] = []
    if run_studio:
        selected_routes.append("studio")
    if run_laboratorio:
        selected_routes.append("laboratorio")

    if not selected_routes:
        log("Nessuna rotta selezionata, esco.")
        sys.exit(0)

    for index, route_key in enumerate(selected_routes, start=1):
        if index > 1:
            print()
            print(f"--- Prossima rotta: {ROUTES[route_key]['label']} ---")
        run_route(route_key)

    log("=== Scraping Gerhò completato ===")
