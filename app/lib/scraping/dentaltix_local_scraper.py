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

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
ECOMMERCE_ID = "5a62b66e-8443-44f5-8855-65391b05912a"
CATALOG_BASE_URL = "https://www.dentaltix.com/it/materiale-clinica-dentale"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

FILLED_STAR_PATH_PREFIX = "M13.9718"


def build_catalog_url(page_number: int) -> str:
    if page_number <= 1:
        return CATALOG_BASE_URL
    return f"{CATALOG_BASE_URL}?page={page_number}"


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def prompt_total_pages() -> int:
    print()
    print(f"Apri {CATALOG_BASE_URL} nel browser e controlla quante pagine ci sono in totale.")
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


def dismiss_cookie_banner(page, page_number: int) -> None:
    button_selectors = [
        "button:has-text('Accetta tutti')",
        "button:has-text('Accetta')",
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
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
            log(f"Pagina {page_number}: banner cookie chiuso ({selector})")
            return
        except Exception:
            continue


def parse_price(price_str: str | None) -> float | None:
    if not price_str:
        return None

    cleaned = price_str.replace("€", "").replace("\xa0", " ").strip()
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


def find_products(soup: BeautifulSoup) -> list:
    return soup.select('[data-testid="product-card"]')


def parse_tag(card) -> str | None:
    tag_el = card.select_one('[class*="clip"]')
    if not tag_el:
        return None
    tag = tag_el.get_text(strip=True)
    return tag or None


def parse_brand(card) -> str | None:
    brand_el = card.select_one("span.text-gray-500")
    if not brand_el:
        return None
    brand_text = brand_el.get_text(strip=True)
    brand = re.sub(r"^di\s+", "", brand_text, flags=re.IGNORECASE).strip()
    return brand or None


def parse_prices_from_card(card) -> tuple[float | None, float | None]:
    price_p = None
    for candidate in card.select("p"):
        if not re.search(r"\d", candidate.get_text()):
            continue
        price_p = candidate
        if candidate.find("del") is not None:
            break

    if not price_p:
        return None, None

    del_el = price_p.find("del")
    old_price = parse_price(del_el.get_text()) if del_el else None
    if del_el:
        del_el.extract()
    final_price = parse_price(price_p.get_text())

    return final_price, old_price


def parse_review_count(card) -> int | None:
    review_el = card.select_one("span.text-gray-600")
    if not review_el:
        return None
    match = re.search(r"\((\d+)\)", review_el.get_text(strip=True))
    return int(match.group(1)) if match else None


def parse_rating_average(card) -> float | None:
    stars = card.select_one(".text-star-primary")
    if not stars:
        return None

    filled = 0
    for svg in stars.select("svg"):
        path = svg.select_one("path")
        if path and path.get("d", "").startswith(FILLED_STAR_PATH_PREFIX):
            filled += 1

    return float(filled) if filled else None


def parse_product_card(card, page_number: int) -> dict | None:
    link = card.select_one("a[href]")
    if not link:
        return None

    href = link.get("href", "").strip()
    if not href:
        return None

    product_url = href if href.startswith("http") else f"https://www.dentaltix.com{href}"
    id_ecommerce = product_url.rstrip("/").split("/")[-1]

    name_el = card.select_one("strong")
    product_name = name_el.get_text(" ", strip=True) if name_el else None

    brand = parse_brand(card)
    tag = parse_tag(card)
    final_price, old_price = parse_prices_from_card(card)
    review_count = parse_review_count(card)
    rating_average = parse_rating_average(card)

    discount = None
    if old_price and final_price and old_price > final_price:
        discount = round(((old_price - final_price) / old_price) * 100, 2)

    if not product_name or not id_ecommerce or final_price is None:
        return None

    return {
        "product_name": product_name,
        "final_price": final_price,
        "product_url": product_url,
        "id_ecommerce": id_ecommerce,
        "old_price": old_price,
        "discount": discount,
        "brand": brand,
        "tag": tag,
        "review_count": review_count,
        "rating_average": rating_average,
        "source_page": page_number,
    }


def scrape_page(page_number: int) -> str | None:
    url = build_catalog_url(page_number)
    log(f"Pagina {page_number}: avvio browser -> {url}")

    with sync_playwright() as p:
        log(f"Pagina {page_number}: lancio Chromium...")
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
            log(f"Pagina {page_number}: navigazione in corso (timeout 90s)...")
            page.goto(url, wait_until="networkidle", timeout=90000)
            log(f"Pagina {page_number}: pagina caricata, titolo: {page.title()!r}")

            dismiss_cookie_banner(page, page_number)
            page.wait_for_selector(
                '[data-testid="product-card"]',
                state="attached",
                timeout=30000,
            )
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1.0)

            html = page.content()
            card_count = html.count('data-testid="product-card"')
            log(
                f"Pagina {page_number}: HTML scaricato "
                f"({len(html):,} caratteri, ~{card_count // 2} card nel DOM)"
            )
            if card_count < 2:
                raise RuntimeError("Nessuna product-card trovata nel DOM")
        except Exception as e:
            log(f"Pagina {page_number}: ERRORE scraping -> {type(e).__name__}: {e!s}")
            html = None
        finally:
            browser.close()
            log(f"Pagina {page_number}: browser chiuso")

    return html


def parse_and_save(
    html_content: str | None, page_number: int, session_id: str
) -> int | None:
    if not html_content:
        log(f"Pagina {page_number}: nessun HTML, salto salvataggio")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    product_cards = find_products(soup)

    if not product_cards:
        log(
            f"Pagina {page_number}: 0 prodotti trovati "
            '(selettore [data-testid="product-card"])'
        )
        return -1

    log(f"Pagina {page_number}: trovati {len(product_cards)} prodotti")

    batch_data = []
    skipped = 0
    seen_urls: set[str] = set()

    for card in product_cards:
        try:
            parsed = parse_product_card(card, page_number)
            if not parsed:
                skipped += 1
                continue

            product_url = parsed["product_url"]
            if product_url in seen_urls:
                continue
            seen_urls.add(product_url)

            record = {
                "product_name": parsed["product_name"],
                "final_price": parsed["final_price"],
                "ecommerce_id": ECOMMERCE_ID,
                "id_ecommerce": parsed["id_ecommerce"],
                "discount": parsed["discount"],
                "brand": parsed["brand"],
                "update_at": datetime.now(timezone.utc).isoformat(),
                "update_session_id": session_id,
                "is_escluded": False,
                "other": {
                    "tag": parsed["tag"],
                    "original_url": product_url,
                    "source_page": parsed["source_page"],
                    "old_price_list": parsed["old_price"],
                    "review_count": parsed["review_count"],
                    "rating_average": parsed["rating_average"],
                },
            }
            batch_data.append(record)

        except Exception as e:
            skipped += 1
            log(
                f"Pagina {page_number}: errore parsing prodotto "
                f"-> {type(e).__name__}: {e}"
            )

    log(f"Pagina {page_number}: {len(batch_data)} prodotti validi, {skipped} scartati")

    if batch_data:
        try:
            log(f"Pagina {page_number}: upsert su Supabase ({len(batch_data)} record)...")
            response = supabase.table("scraped_product").upsert(
                batch_data,
                on_conflict="ecommerce_id,id_ecommerce",
            ).execute()
            saved = len(response.data) if response.data else len(batch_data)
            log(f"Pagina {page_number}: upsert OK ({saved} record)")
        except Exception as e:
            log(f"Pagina {page_number}: ERRORE database -> {type(e).__name__}: {e}")
    else:
        log(f"Pagina {page_number}: nessun record da salvare")

    return 0


if __name__ == "__main__":
    log("=== Avvio dentaltix_local_scraper (materiale clinica dentale) ===")
    log(f"Supabase URL: {SUPABASE_URL}")
    log(f"Ecommerce ID: {ECOMMERCE_ID}")
    log(f"Catalogo: {CATALOG_BASE_URL}")

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
        print("  python app/lib/scraping/dentaltix_local_scraper.py")
        print()
        sys.exit(1)

    total_pages = prompt_total_pages()
    page = prompt_start_page(total_pages)
    session_id = prompt_session_id(supabase, ECOMMERCE_ID, "Dentaltix")
    log(f"Configurazione: pagine {page} → {total_pages} (totale {total_pages - page + 1})")
    log(f"Session ID: {session_id}")

    while True:
        if page > total_pages:
            log(f"Raggiunta ultima pagina ({total_pages}), stop")
            break
        if page > 5000:
            log("Limite sicurezza 5000 pagine raggiunto, stop")
            break

        log(f"--- Inizio pagina {page}/{total_pages} ---")
        html = scrape_page(page)
        result = parse_and_save(html, page, session_id)

        if result == -1:
            log(f"Pagina {page}: nessun prodotto, fine scraping")
            break

        pause = random.uniform(2.5, 5.0)
        log(f"Pagina {page}: pausa {pause:.1f}s prima della prossima")
        time.sleep(pause)
        page += 1

    log("=== Scraping Dentaltix completato ===")
