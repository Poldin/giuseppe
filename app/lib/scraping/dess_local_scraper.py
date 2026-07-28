import json
import os
import re
import sys
import time
import random
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

from scrape_cli import load_config, parse_config_path, prompt_yes_no, require_interactive_tty
from scrape_session import prompt_run_mode, prompt_session_id
from scrape_pages import scrape_html_with_retries

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
ECOMMERCE_ID = "adbb6a8d-4757-4b49-9103-4f8d1f120edb"
SITE_ORIGIN = "https://www.dessdental.com"

# Catalogo Magento corto e paginazione affidabile: basta 2 vuote di fila.
EMPTY_STREAK_STOP = 2
MAX_PAGES_PER_ROUTE = 5000

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ROUTES: dict[str, dict[str, object]] = {
    "products": {
        "label": "PRODUCTS",
        "urls": [f"{SITE_ORIGIN}/it-it/products"],
    },
    "implants": {
        "label": "IMPLANTS",
        "urls": [f"{SITE_ORIGIN}/it-it/implants"],
    },
    "implant_brands": {
        "label": "IMPLANT_BRANDS",
        "urls": [f"{SITE_ORIGIN}/it-it/implant-brands"],
    },
}

CATALOG_ITEM_SELECTOR = "li.item.product.product-item"
HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
}


def build_catalog_url(base_url: str, page_number: int) -> str:
    if page_number <= 1:
        return base_url
    return f"{base_url}?p={page_number}"


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def prompt_start_page() -> int:
    print()
    print("Da quale pagina vuoi partire?")
    print(
        f'  Invio / "y" → pagina 1, continua '
        f"(stop dopo {EMPTY_STREAK_STOP} pagine vuote di fila)"
    )
    print(
        f"  Numero N    → pagina N, continua "
        f"(stop dopo {EMPTY_STREAK_STOP} pagine vuote di fila)"
    )

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


def parse_price(price_str: str | None) -> float | None:
    if price_str is None:
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


def find_products(soup: BeautifulSoup) -> list:
    return soup.select(CATALOG_ITEM_SELECTOR)


def extract_product_id(card) -> str | None:
    price_box = card.select_one("[data-product-id]")
    if price_box and price_box.get("data-product-id"):
        return str(price_box["data-product-id"]).strip() or None

    info = card.find(id=re.compile(r"^product-item-info_\d+$"))
    if info and info.get("id"):
        return info["id"].replace("product-item-info_", "").strip() or None

    form = card.select_one('form input[name="product"]')
    if form and form.get("value"):
        return str(form["value"]).strip() or None

    price_id = card.select_one("[id^=product-price-]")
    if price_id and price_id.get("id"):
        return price_id["id"].replace("product-price-", "").strip() or None

    return None


def extract_name_and_url(card) -> tuple[str | None, str | None]:
    # Tema Porto: product-item-link è uno <span href="...">, non un <a>.
    name_el = card.select_one("span.product-item-link")
    if name_el:
        name = name_el.get_text(" ", strip=True) or None
        url = (name_el.get("href") or "").strip() or None
        if name and url:
            return name, url

    heading = card.select_one("h3.product-item-name")
    if heading:
        name = heading.get_text(" ", strip=True) or None
        nested = heading.select_one("[href]")
        url = (nested.get("href") if nested else None) or None
        if name and url:
            return name, url
        if name:
            link = card.select_one("a.post.featured.image, a.product-item-photo, a[href]")
            href = (link.get("href") if link else None) or None
            return name, href

    link = card.select_one("a.product-item-link")
    if link:
        return (
            link.get_text(" ", strip=True) or None,
            (link.get("href") or "").strip() or None,
        )

    link = card.select_one("a.post.featured.image, a[href]")
    if link:
        return (
            link.get_text(" ", strip=True) or None,
            (link.get("href") or "").strip() or None,
        )

    return None, None


def parse_product_card(card, page_number: int) -> dict | None:
    product_id = extract_product_id(card)
    product_name, product_url = extract_name_and_url(card)

    final_el = card.select_one('[data-price-type="finalPrice"]')
    old_el = card.select_one('[data-price-type="oldPrice"]')

    final_price = None
    if final_el and final_el.get("data-price-amount") is not None:
        final_price = parse_price(final_el.get("data-price-amount"))
    if final_price is None and final_el:
        final_price = parse_price(final_el.get_text(" ", strip=True))

    old_price = None
    if old_el and old_el.get("data-price-amount") is not None:
        old_price = parse_price(old_el.get("data-price-amount"))
    if old_price is None and old_el:
        old_price = parse_price(old_el.get_text(" ", strip=True))

    discount = None
    if old_price and final_price and old_price > final_price:
        discount = round(((old_price - final_price) / old_price) * 100, 2)

    if not product_id or not product_name or final_price is None or not product_url:
        return None

    if product_url.startswith("/"):
        product_url = f"{SITE_ORIGIN}{product_url}"

    return {
        "product_name": product_name,
        "final_price": final_price,
        "product_url": product_url,
        "id_ecommerce": product_id,
        "old_price": old_price,
        "discount": discount,
        "source_page": page_number,
    }


def scrape_page(page_number: int, route_label: str, base_url: str) -> str | None:
    """Magento è SSR: HTTP basta; niente Playwright / wait selector."""
    url = build_catalog_url(base_url, page_number)
    log(f"[{route_label}] Pagina {page_number}: fetch -> {url}")

    try:
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
        html = raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            log(f"[{route_label}] Pagina {page_number}: HTTP 404 (fine catalogo)")
            return ""
        log(
            f"[{route_label}] Pagina {page_number}: "
            f"ERRORE scraping -> HTTPError {e.code}: {e.reason}"
        )
        return None
    except Exception as e:
        log(
            f"[{route_label}] Pagina {page_number}: "
            f"ERRORE scraping -> {type(e).__name__}: {e!s}"
        )
        return None

    soup = BeautifulSoup(html, "html.parser")
    card_count = len(find_products(soup))
    title_el = soup.select_one("title")
    title = title_el.get_text(strip=True) if title_el else ""
    log(
        f"[{route_label}] Pagina {page_number}: HTML scaricato "
        f"({len(html):,} caratteri, {card_count} card, titolo={title!r})"
    )
    if card_count < 1:
        log(
            f"[{route_label}] Pagina {page_number}: "
            "nessuna card prodotto (pagina vuota / fine catalogo)"
        )
    return html


def collect_product_ids(html_content: str | None) -> set[str]:
    if html_content is None:
        return set()
    ids: set[str] = set()
    for card in find_products(BeautifulSoup(html_content, "html.parser")):
        product_id = extract_product_id(card)
        if product_id:
            ids.add(product_id)
    return ids


def parse_and_save(
    html_content: str | None,
    page_number: int,
    session_id: str,
    route_label: str,
) -> int | None:
    if html_content is None:
        log(f"[{route_label}] Pagina {page_number}: nessun HTML, salto salvataggio")
        return None

    soup = BeautifulSoup(html_content, "html.parser")
    product_cards = find_products(soup)

    if not product_cards:
        log(
            f"[{route_label}] Pagina {page_number}: 0 prodotti trovati "
            f"(selettore {CATALOG_ITEM_SELECTOR})"
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
        f"{skipped} scartati, {duplicate_ids} duplicati id_ecommerce"
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


def route_urls(route: dict[str, object]) -> list[str]:
    urls = route.get("urls")
    if isinstance(urls, list) and urls:
        return [str(u) for u in urls]
    base = route.get("base_url")
    if isinstance(base, str) and base:
        return [base]
    raise ValueError(f"rotta senza urls/base_url: {route!r}")


def run_route(
    route_key: str,
    *,
    session_id: str | None = None,
    start_page: int | None = None,
) -> None:
    route = ROUTES[route_key]
    label = str(route["label"])
    urls = route_urls(route)

    print()
    print(f"=== Configurazione rotta {label} ===")
    for url in urls:
        print(f"URL: {url}")
    print(
        f"Le pagine verranno scrapate in automatico "
        f"(stop dopo {EMPTY_STREAK_STOP} pagine consecutive senza dati)."
    )

    if start_page is None:
        start_page = prompt_start_page()

    if session_id is None:
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, f"DESS {label}")

    log(f"[{label}] Session ID: {session_id}")

    total_pages_scraped = 0
    for url_index, base_url in enumerate(urls):
        url_start = start_page if url_index == 0 else 1
        section = (
            label
            if len(urls) == 1
            else f"{label}/{base_url.rstrip('/').split('/')[-1]}"
        )
        log(f"[{section}] Catalogo {url_index + 1}/{len(urls)}: {base_url}")
        log(
            f"[{section}] Partenza da pagina {url_start} "
            f"(stop dopo {EMPTY_STREAK_STOP} vuote di fila)"
        )

        page_number = url_start
        pages_scraped = 0
        empty_streak = 0
        prev_ids: set[str] | None = None
        seen_ids: set[str] = set()

        while page_number <= MAX_PAGES_PER_ROUTE:
            log(f"[{section}] --- Inizio pagina {page_number} ---")

            html = scrape_html_with_retries(
                lambda p=page_number, u=base_url, s=section: scrape_page(p, s, u),
                log_fn=log,
                label=section,
                page_number=page_number,
            )
            page_ids = collect_product_ids(html)

            # Alcune categorie Magento ignorano ?p= e ripropongono gli stessi item.
            if (
                page_number > url_start
                and page_ids
                and prev_ids is not None
                and page_ids == prev_ids
            ):
                log(
                    f"[{section}] Pagina {page_number}: identica alla precedente "
                    "(paginazione ignorata dal sito), stop catalogo"
                )
                break
            if page_ids and page_ids.issubset(seen_ids):
                log(
                    f"[{section}] Pagina {page_number}: tutti id già visti, "
                    "stop catalogo"
                )
                break

            result = parse_and_save(html, page_number, session_id, section)

            if result == 0:
                empty_streak = 0
                pages_scraped += 1
                seen_ids.update(page_ids)
                prev_ids = page_ids
            else:
                empty_streak += 1
                reason = "errore scraping" if result is None else "nessun prodotto"
                log(
                    f"[{section}] Pagina {page_number}: {reason} "
                    f"(streak vuote {empty_streak}/{EMPTY_STREAK_STOP})"
                )
                if empty_streak >= EMPTY_STREAK_STOP:
                    log(
                        f"[{section}] Stop: {EMPTY_STREAK_STOP} pagine consecutive "
                        "senza dati"
                    )
                    break

            page_number += 1

            pause = random.uniform(1.5, 3.0)
            if result != 0:
                pause = random.uniform(2.5, 4.5)
            log(
                f"[{section}] Pagina {page_number - 1}: "
                f"pausa {pause:.1f}s prima della prossima"
            )
            time.sleep(pause)

        if page_number > MAX_PAGES_PER_ROUTE:
            log(
                f"[{section}] Limite sicurezza {MAX_PAGES_PER_ROUTE} pagine raggiunto, "
                "stop"
            )

        total_pages_scraped += pages_scraped
        log(f"=== Catalogo {section} completato ({pages_scraped} pagine con dati) ===")

    log(f"=== Rotta {label} completata ({total_pages_scraped} pagine con dati) ===")


def run_from_config(config: dict) -> None:
    routes = config.get("routes")
    if not isinstance(routes, list) or not routes:
        raise ValueError("routes deve essere una lista non vuota")

    session_id = str(config.get("session_id", "")).strip()
    if not session_id:
        raise ValueError("session_id mancante nella config DESS")

    start_page = int(config.get("start_page", 1))
    if start_page < 1:
        raise ValueError(f"start_page >= 1, ricevuto {start_page}")

    for index, route_key in enumerate(routes, start=1):
        if route_key not in ROUTES:
            raise ValueError(f"rotta DESS sconosciuta: {route_key!r}")

        if index > 1:
            print()
            print(f"--- Prossima rotta: {ROUTES[route_key]['label']} ---")

        run_route(
            route_key,
            session_id=session_id,
            start_page=start_page,
        )

    log("=== Scraping DESS completato ===")


def main(argv: list[str] | None = None) -> None:
    config_path = parse_config_path(argv)

    log("=== Avvio dess_local_scraper ===")
    log(f"Supabase URL: {SUPABASE_URL}")
    log(f"Ecommerce ID: {ECOMMERCE_ID}")
    for route in ROUTES.values():
        label = route["label"]
        for url in route_urls(route):
            log(f"Rotta {label}: {url}")

    try:
        test = supabase.table("scraped_product").select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test query: {len(test.data)} righe)")
    except Exception as e:
        log(f"Connessione Supabase FALLITA -> {type(e).__name__}: {e}")
        sys.exit(1)

    if config_path is not None:
        try:
            run_from_config(load_config(config_path))
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            log(f"Config non valida: {exc}")
            sys.exit(1)
        return

    require_interactive_tty("python app/lib/scraping/dess_local_scraper.py")

    print()
    mode = prompt_run_mode()

    if mode == "direct":
        selected_routes = list(ROUTES.keys())
        log(
            "Modalità diretta: rotte "
            f"{', '.join(str(ROUTES[key]['label']) for key in selected_routes)}"
        )
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, "DESS")
        start_page = 1
        log("Modalità diretta: partenza da pagina 1")
    else:
        print()
        print("Quali rotte DESS vuoi eseguire?")
        run_products = prompt_yes_no("Eseguire la rotta PRODUCTS (~496)?")
        run_implants = prompt_yes_no("Eseguire la rotta IMPLANTS (~26)?")
        run_brands = prompt_yes_no("Eseguire la rotta IMPLANT_BRANDS (~457)?")

        selected_routes = []
        if run_products:
            selected_routes.append("products")
        if run_implants:
            selected_routes.append("implants")
        if run_brands:
            selected_routes.append("implant_brands")

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

    log("=== Scraping DESS completato ===")


if __name__ == "__main__":
    main()
