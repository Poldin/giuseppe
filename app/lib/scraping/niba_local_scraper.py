import json
import os
import re
import sys
import time
import random
import http.cookiejar
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
ECOMMERCE_ID = "c86f7bd2-9a3a-4426-87ed-cc127e84e5d7"
SITE_ORIGIN = "https://nibafd.com"

# PrestaShop: dopo la fine catalogo restano card sticky → stop anche su id già visti.
EMPTY_STREAK_STOP = 2
MAX_PAGES_PER_ROUTE = 5000

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

ROUTES: dict[str, dict[str, object]] = {
    "home": {
        "label": "HOME",
        "urls": [f"{SITE_ORIGIN}/2-home"],
    },
}

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


class HttpSession:
    """PrestaShop richiede cookie di sessione per la lista catalogo completa."""

    def __init__(self) -> None:
        self._cj = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._cj)
        )
        self._warmed = False

    def warm(self) -> None:
        if self._warmed:
            return
        req = urllib.request.Request(f"{SITE_ORIGIN}/", headers=HTTP_HEADERS)
        with self._opener.open(req, timeout=60) as resp:
            resp.read()
        self._warmed = True

    def get(self, url: str) -> str:
        self.warm()
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with self._opener.open(req, timeout=60) as resp:
            raw = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


http_session = HttpSession()


def build_catalog_url(base_url: str, page_number: int) -> str:
    if page_number <= 1:
        return base_url
    return f"{base_url}?page={page_number}"


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
    box = soup.select_one("#js-product-list")
    if not box:
        return []

    cards = box.select("article.product-miniature, article.js-product-miniature")
    if cards:
        # Deduplicate by data-id-product (theme ripete attributi nel DOM).
        seen: set[str] = set()
        unique: list = []
        for card in cards:
            pid = card.get("data-id-product")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            unique.append(card)
        return unique

    seen = set()
    unique = []
    for el in box.select("[data-id-product]"):
        pid = el.get("data-id-product")
        if not pid or pid in seen:
            continue
        art = el if el.name == "article" else el.find_parent("article")
        unique.append(art or el)
        seen.add(pid)
    return unique


def extract_product_id(card) -> str | None:
    if card.get("data-id-product"):
        return str(card["data-id-product"]).strip() or None
    nested = card.select_one("[data-id-product]")
    if nested and nested.get("data-id-product"):
        return str(nested["data-id-product"]).strip() or None
    return None


def parse_product_card(card, page_number: int) -> dict | None:
    product_id = extract_product_id(card)
    name_el = card.select_one("p.product-name a, .product-name a")
    product_name = name_el.get_text(" ", strip=True) if name_el else None
    if not product_name:
        img = card.select_one("img[alt]")
        product_name = (img.get("alt") or "").strip() or None

    link = card.select_one(
        "p.product-name a, a.product-cover-link, a[href*='.html']"
    )
    product_url = (link.get("href") or "").split("#")[0].strip() if link else None

    price_el = card.select_one("span.price, .product-price")
    final_price = parse_price(price_el.get_text(" ", strip=True) if price_el else None)

    old_el = card.select_one(".regular-price")
    old_price = parse_price(old_el.get_text(" ", strip=True) if old_el else None)

    text_l = card.get_text(" ", strip=True).lower()
    on_request = "richiesta" in text_l or final_price == 0.0

    discount = None
    if (
        not on_request
        and old_price
        and final_price is not None
        and old_price > final_price
    ):
        discount = round(((old_price - final_price) / old_price) * 100, 2)

    if not product_id or not product_name or not product_url:
        return None

    # Prezzo a richiesta: salva con 0 e flag (resta visibile in catalogo scrapato).
    if final_price is None:
        if on_request:
            final_price = 0.0
        else:
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
        "on_request": on_request,
        "source_page": page_number,
    }


def scrape_page(page_number: int, route_label: str, base_url: str) -> str | None:
    url = build_catalog_url(base_url, page_number)
    log(f"[{route_label}] Pagina {page_number}: fetch -> {url}")

    try:
        html = http_session.get(url)
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
    total_el = soup.select_one(".total-products")
    total_txt = total_el.get_text(" ", strip=True) if total_el else ""
    log(
        f"[{route_label}] Pagina {page_number}: HTML scaricato "
        f"({len(html):,} caratteri, {card_count} card, titolo={title!r}"
        + (f", {total_txt}" if total_txt else "")
        + ")"
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
            "(selettore #js-product-list)"
        )
        return -1

    log(f"[{route_label}] Pagina {page_number}: trovati {len(product_cards)} prodotti")

    batch_data = []
    skipped = 0
    duplicate_ids = 0
    on_request_count = 0
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

            if parsed["on_request"]:
                on_request_count += 1

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
                    "price_on_request": parsed["on_request"],
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
        + (f", {on_request_count} prezzo-a-richiesta" if on_request_count else "")
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
        f"(stop dopo {EMPTY_STREAK_STOP} pagine consecutive senza dati "
        "oppure se gli id sono già tutti visti)."
    )

    if start_page is None:
        start_page = prompt_start_page()

    if session_id is None:
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, f"Niba {label}")

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

            if (
                page_number > url_start
                and page_ids
                and prev_ids is not None
                and page_ids == prev_ids
            ):
                log(
                    f"[{section}] Pagina {page_number}: identica alla precedente "
                    "(paginazione ignorata / sticky), stop catalogo"
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
        log(
            f"=== Catalogo {section} completato "
            f"({pages_scraped} pagine con dati, {len(seen_ids)} id unici) ==="
        )

    log(f"=== Rotta {label} completata ({total_pages_scraped} pagine con dati) ===")


def run_from_config(config: dict) -> None:
    routes = config.get("routes")
    if not isinstance(routes, list) or not routes:
        raise ValueError("routes deve essere una lista non vuota")

    session_id = str(config.get("session_id", "")).strip()
    if not session_id:
        raise ValueError("session_id mancante nella config Niba")

    start_page = int(config.get("start_page", 1))
    if start_page < 1:
        raise ValueError(f"start_page >= 1, ricevuto {start_page}")

    for index, route_key in enumerate(routes, start=1):
        if route_key not in ROUTES:
            raise ValueError(f"rotta Niba sconosciuta: {route_key!r}")

        if index > 1:
            print()
            print(f"--- Prossima rotta: {ROUTES[route_key]['label']} ---")

        run_route(
            route_key,
            session_id=session_id,
            start_page=start_page,
        )

    log("=== Scraping Niba completato ===")


def main(argv: list[str] | None = None) -> None:
    config_path = parse_config_path(argv)

    log("=== Avvio niba_local_scraper ===")
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

    require_interactive_tty("python app/lib/scraping/niba_local_scraper.py")

    print()
    mode = prompt_run_mode()

    if mode == "direct":
        selected_routes = list(ROUTES.keys())
        log(
            "Modalità diretta: rotte "
            f"{', '.join(str(ROUTES[key]['label']) for key in selected_routes)}"
        )
        session_id = prompt_session_id(supabase, ECOMMERCE_ID, "Niba")
        start_page = 1
        log("Modalità diretta: partenza da pagina 1")
    else:
        print()
        print("Quali rotte Niba vuoi eseguire?")
        run_home = prompt_yes_no("Eseguire la rotta HOME (/2-home, ~752)?")

        selected_routes = []
        if run_home:
            selected_routes.append("home")

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

    log("=== Scraping Niba completato ===")


if __name__ == "__main__":
    main()
