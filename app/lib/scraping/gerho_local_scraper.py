import os
import sys
import time
import random
import re
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client, Client

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
STUDIO_BASE_URL = "https://www.gerho.it/STUDIO/"
STUDIO_ORDER = "manufacturer-sort"


def build_studio_url(page_number: int) -> str:
    if page_number <= 1:
        return STUDIO_BASE_URL
    return f"{STUDIO_BASE_URL}?order={STUDIO_ORDER}&p={page_number}"


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

def scrape_page(page_number):
    url = build_studio_url(page_number)
    log(f"Pagina {page_number}: avvio browser -> {url}")

    with sync_playwright() as p:
        log(f"Pagina {page_number}: lancio Chromium...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Chrome/120.0.0.0)",
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        try:
            log(f"Pagina {page_number}: navigazione in corso (timeout 60s)...")
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            log(f"Pagina {page_number}: pagina caricata, titolo: {page.title()!r}")

            dismiss_overlays(page, page_number)
            page.wait_for_selector(
                ".cms-element-product-listing .order-wrapper",
                timeout=30000,
            )

            html = page.content()
            log(f"Pagina {page_number}: HTML scaricato ({len(html):,} caratteri)")
        except Exception as e:
            log(f"Pagina {page_number}: ERRORE scraping -> {type(e).__name__}: {e!s}")
            html = None
        finally:
            browser.close()
            log(f"Pagina {page_number}: browser chiuso")

    return html


def prompt_total_pages() -> int:
    print()
    print(f"Apri {STUDIO_BASE_URL} nel browser e controlla quante pagine ci sono in totale.")
    while True:
        raw = input("Quante sono le pagine totali? ").strip()
        try:
            total = int(raw)
            if total >= 1:
                return total
            print("Inserisci un numero >= 1.")
        except ValueError:
            print("Numero non valido, riprova.")


def prompt_start_page(total_pages: int) -> int:
    print()
    print("Da quale pagina vuoi partire?")
    print('  Premi "y" (o Invio) per iniziare dalla pagina 1')
    print(f"  Oppure inserisci un numero da 1 a {total_pages}")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return 1
        try:
            start = int(raw)
            if 1 <= start <= total_pages:
                return start
            print(f"Inserisci un numero tra 1 e {total_pages}.")
        except ValueError:
            print('Premi "y" per la pagina 1, oppure inserisci un numero.')


def parse_and_save(html_content, page_number) -> int | None:
    if not html_content:
        log(f"Pagina {page_number}: nessun HTML, salto salvataggio")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    product_items = find_studio_products(soup)

    if not product_items:
        log(
            f"Pagina {page_number}: 0 prodotti trovati "
            "(selettore .cms-element-product-listing .order-wrapper)"
        )
        return -1

    log(f"Pagina {page_number}: trovati {len(product_items)} prodotti nella tabella STUDIO")

    batch_data = []
    skipped = 0

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

            record = {
                "product_name": product_name,
                "final_price": final_price,
                "ecommerce_id": ECOMMERCE_ID,
                "id_ecommerce": sku,
                "discount": discount,
                "update_at": datetime.now().isoformat(),
                "other": {
                    "original_url": product_url,
                    "source_page": page_number,
                    "old_price_list": old_price,
                },
            }
            batch_data.append(record)

        except Exception as e:
            skipped += 1
            log(f"Pagina {page_number}: errore parsing singolo prodotto -> {type(e).__name__}: {e}")
            continue

    log(f"Pagina {page_number}: {len(batch_data)} prodotti validi, {skipped} scartati")

    if batch_data:
        try:
            log(f"Pagina {page_number}: upsert su Supabase ({len(batch_data)} record)...")
            response = supabase.table("scraped_product").upsert(
                batch_data,
                on_conflict="ecommerce_id,id_ecommerce"
            ).execute()
            saved = len(response.data) if response.data else len(batch_data)
            log(f"Pagina {page_number}: upsert OK ({saved} record)")
        except Exception as e:
            log(f"Pagina {page_number}: ERRORE database -> {type(e).__name__}: {e}")
    else:
        log(f"Pagina {page_number}: nessun record da salvare")

    return 0

if __name__ == "__main__":
    log("=== Avvio gerho_local_scraper (sezione STUDIO) ===")
    log(f"Supabase URL: {SUPABASE_URL}")
    log(f"Ecommerce ID: {ECOMMERCE_ID}")
    log(f"Base URL: {STUDIO_BASE_URL}")

    try:
        test = supabase.table("scraped_product").select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test query: {len(test.data)} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    if not sys.stdin.isatty():
        print()
        print("Questo script chiede input interattivo (pagine totali, pagina di partenza).")
        print("Non puoi rispondere dalla scheda Output / Code Runner.")
        print()
        print("Apri il Terminale integrato (Ctrl+`) e lancia:")
        print("  python app/lib/scraping/gerho_local_scraper.py")
        print()
        sys.exit(1)

    total_pages = prompt_total_pages()
    page = prompt_start_page(total_pages)
    log(f"Configurazione: pagine {page} → {total_pages} (totale {total_pages - page + 1})")

    while True:
        if page > total_pages:
            log(f"Raggiunta ultima pagina ({total_pages}), stop")
            break
        if page > 1000:
            log("Limite sicurezza 1000 pagine raggiunto, stop")
            break

        log(f"--- Inizio pagina {page}/{total_pages} ---")
        html = scrape_page(page)
        result = parse_and_save(html, page)

        if result == -1:
            log(f"Pagina {page}: nessun prodotto, fine scraping")
            break

        pause = random.uniform(2.5, 5.0)
        log(f"Pagina {page}: pausa {pause:.1f}s prima della prossima")
        time.sleep(pause)
        page += 1
