"""
Orchestratore scraping cataloghi e-commerce.

Due modalità:
  regionale   → flusso attuale: conferma e domande dentro ogni scraper
  frecciarossa → tutte le domande all'inizio, poi run silenzioso via --config

Uso (dal terminale integrato):
  python app/lib/scraping/run_all_scrapers.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Literal

from scrape_cli import prompt_yes_no, require_interactive_tty
from scrape_pages import page_plan_to_dict, prompt_page_plan, prompt_total_pages
from scrape_session import default_session_id

SCRAPING_DIR = Path(__file__).resolve().parent

OrchestratorMode = Literal["regionale", "frecciarossa"]

# Aggiungi qui i nuovi e-commerce man mano che crei gli scraper.
SCRAPERS: list[dict[str, Any]] = [
    {
        "key": "dentaltix",
        "name": "Dentaltix",
        "script": "dentaltix_local_scraper.py",
        "note": "Clinica, Apparecchiature, Laboratorio",
        "catalog_url": None,
        "routes": [
            {
                "key": "clinica",
                "label": "CLINICA",
                "url": "https://www.dentaltix.com/it/materiale-clinica-dentale",
            },
            {
                "key": "apparecchiature",
                "label": "APPARECCHIATURE",
                "url": "https://www.dentaltix.com/it/apparecchiature",
            },
            {
                "key": "laboratorio",
                "label": "LABORATORIO",
                "url": "https://www.dentaltix.com/it/laboratorio-0",
            },
        ],
    },
    {
        "key": "gerho",
        "name": "Gerhò",
        "script": "gerho_local_scraper.py",
        "note": "Rotte STUDIO e/o LABORATORIO",
        "catalog_url": None,
        "routes": [
            {
                "key": "studio",
                "label": "STUDIO",
                "url": "https://www.gerho.it/STUDIO/",
            },
            {
                "key": "laboratorio",
                "label": "LABORATORIO",
                "url": "https://www.gerho.it/LABORATORIO/",
            },
        ],
    },
    {
        "key": "dontalia",
        "name": "Dontalia",
        "script": "dontalia_local_scraper.py",
        "note": "Studio, Laboratorio, Apparecchiatura, Ortodonzia",
        "catalog_url": None,
        "routes": [
            {
                "key": "studio",
                "label": "STUDIO",
                "url": "https://www.dontalia.it/studio.html",
            },
            {
                "key": "laboratorio",
                "label": "LABORATORIO",
                "url": "https://www.dontalia.it/laboratorio.html",
            },
            {
                "key": "apparecchiatura",
                "label": "APPARECCHIATURA",
                "url": "https://www.dontalia.it/apparecchiatura.html",
            },
            {
                "key": "ortodonzia",
                "label": "ORTODONZIA",
                "url": "https://www.dontalia.it/ortodonzia.html",
            },
        ],
    },
]


def prompt_orchestrator_mode() -> OrchestratorMode:
    print()
    print("Modalità treno:")
    print('  Invio / "r" → regionale  (domande durante ogni scraper, come oggi)')
    print('  "f"         → frecciarossa (tutte le domande ora, poi run senza interruzioni)')

    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "r", "regionale"):
            return "regionale"
        if raw in ("f", "frecciarossa", "freccia"):
            return "frecciarossa"
        print('Inserisci "r" per regionale o "f" per frecciarossa.')


def prompt_session_id_global() -> str:
    default_id = default_session_id()
    print()
    print("Session ID per tutti gli e-commerce selezionati")
    print(f"Premi Invio per usare il timestamp corrente: {default_id}")
    print("Oppure inserisci un session ID (esistente o nuovo):")
    raw = input("> ").strip()
    session_id = raw if raw else default_id
    print(f"Session ID selezionato: {session_id}")
    return session_id


def prompt_start_page_shared() -> int:
    print()
    print("Dontalia: da quale pagina partire? (continua fino a pagina vuota)")
    print('  Invio / "y" → pagina 1')
    print("  Numero N    → pagina N")

    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return 1
        if raw.isdigit():
            page = int(raw)
            if page >= 1:
                return page
            print("Inserisci un numero >= 1.")
            continue
        print("Inserisci un numero >= 1 oppure Invio per partire da 1.")


def collect_frecciarossa_plan() -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Raccoglie config per ogni ecommerce abilitato. Ritorna [(scraper, config), ...]."""
    print()
    print("=== Questionario Frecciarossa ===")
    print("Rispondi a tutto ora: dopo non ti verrà chiesto nulla.")
    print()

    selected: list[dict[str, Any]] = []
    for scraper in SCRAPERS:
        if prompt_yes_no(f"Includere {scraper['name']}?"):
            selected.append(scraper)

    if not selected:
        print("Nessun e-commerce selezionato.")
        return []

    session_id = prompt_session_id_global()
    planned: list[tuple[dict[str, Any], dict[str, Any]]] = []

    for scraper in selected:
        key = scraper["key"]
        name = scraper["name"]
        print()
        print(f"--- Configurazione {name} ---")

        if key in ("dentaltix", "gerho"):
            routes_meta = scraper["routes"] or []
            routes: list[str] = []
            for route in routes_meta:
                if prompt_yes_no(f"{name}: eseguire rotta {route['label']}?"):
                    routes.append(route["key"])
            if not routes:
                print(f"Nessuna rotta per {name}, saltato.")
                continue

            page_plan = prompt_page_plan()
            config: dict[str, Any] = {
                "session_id": session_id,
                "routes": routes,
                "page_plan": page_plan_to_dict(page_plan),
                "total_pages_by_route": {},
            }
            if page_plan.mode == "range":
                url_by_key = {route["key"]: route["url"] for route in routes_meta}
                for route_key in routes:
                    print()
                    print(f"=== Totale pagine {name} {route_key.upper()} ===")
                    config["total_pages_by_route"][route_key] = prompt_total_pages(
                        url_by_key[route_key]
                    )
            planned.append((scraper, config))
            continue

        if key == "dontalia":
            routes_meta = scraper["routes"] or []
            routes = []
            for route in routes_meta:
                if prompt_yes_no(f"Dontalia: eseguire rotta {route['label']}?"):
                    routes.append(route["key"])
            if not routes:
                print(f"Nessuna rotta per {name}, saltato.")
                continue

            start_page = prompt_start_page_shared()
            planned.append(
                (
                    scraper,
                    {
                        "session_id": session_id,
                        "routes": routes,
                        "start_page": start_page,
                    },
                )
            )
            continue

        print(f"ERRORE: ecommerce non gestito in frecciarossa: {key}")

    return planned


def print_frecciarossa_summary(
    planned: list[tuple[dict[str, Any], dict[str, Any]]],
) -> None:
    print()
    print("=== Riepilogo Frecciarossa ===")
    for scraper, config in planned:
        name = scraper["name"]
        if scraper["key"] in ("dentaltix", "gerho"):
            routes = ", ".join(config["routes"])
            plan = config["page_plan"]
            if plan["mode"] == "list":
                detail = f"pagine {plan['pages']}"
            else:
                totals = ", ".join(
                    f"{key}={config['total_pages_by_route'][key]}"
                    for key in config["routes"]
                )
                detail = f"da {plan['start_page']}, totali [{totals}]"
            print(f"  • {name}: rotte [{routes}]; {detail}")
        elif scraper["key"] == "dontalia":
            routes = ", ".join(config["routes"])
            print(
                f"  • {name}: rotte [{routes}]; "
                f"start page {config['start_page']} (fino a vuota)"
            )
        else:
            print(f"  • {name}")
    print(f"  Session ID: {planned[0][1]['session_id']}")
    print()


def run_scraper(script_name: str, config: dict[str, Any] | None = None) -> int:
    script_path = SCRAPING_DIR / script_name
    if not script_path.is_file():
        print(f"ERRORE: script non trovato -> {script_path}")
        return 1

    if config is None:
        return subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(SCRAPING_DIR),
        ).returncode

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".json",
        prefix="scrape_config_",
        delete=False,
    ) as handle:
        json.dump(config, handle, ensure_ascii=False, indent=2)
        config_path = Path(handle.name)

    try:
        return subprocess.run(
            [sys.executable, str(script_path), "--config", str(config_path)],
            cwd=str(SCRAPING_DIR),
        ).returncode
    finally:
        config_path.unlink(missing_ok=True)


def run_regionale() -> None:
    completed: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for index, scraper in enumerate(SCRAPERS, start=1):
        name = scraper["name"]
        note = scraper.get("note", "")
        note_line = f" ({note})" if note else ""

        print()
        print(f"--- [{index}/{len(SCRAPERS)}] {name}{note_line} ---")

        if not prompt_yes_no(f"Procedere con {name}?"):
            print(f"Saltato: {name}")
            skipped.append(name)
            continue

        print(f"Avvio scraper {name}...")
        print("-" * 50)
        exit_code = run_scraper(scraper["script"])
        print("-" * 50)

        if exit_code == 0:
            print(f"Completato: {name}")
            completed.append(name)
            continue

        print(f"Terminato con errore (codice {exit_code}): {name}")
        failed.append(name)

        if index < len(SCRAPERS) and not prompt_yes_no(
            "Continuare con il prossimo e-commerce?",
            default=False,
        ):
            break

    print_riepilogo(completed, skipped, failed)


def run_frecciarossa() -> None:
    planned = collect_frecciarossa_plan()
    if not planned:
        print()
        print("=== Orchestrazione terminata (nessun job) ===")
        return

    print_frecciarossa_summary(planned)
    if not prompt_yes_no("Confermi e parti in frecciarossa?", default=True):
        print("Annullato.")
        return

    completed: list[str] = []
    failed: list[str] = []

    for index, (scraper, config) in enumerate(planned, start=1):
        name = scraper["name"]
        print()
        print(f"--- [{index}/{len(planned)}] {name} (frecciarossa) ---")
        print(f"Avvio scraper {name} senza ulteriori domande...")
        print("-" * 50)
        exit_code = run_scraper(scraper["script"], config)
        print("-" * 50)

        if exit_code == 0:
            print(f"Completato: {name}")
            completed.append(name)
            continue

        print(f"Terminato con errore (codice {exit_code}): {name}")
        failed.append(name)

        if index < len(planned) and not prompt_yes_no(
            "Continuare con il prossimo e-commerce?",
            default=False,
        ):
            break

    print_riepilogo(completed, [], failed)


def print_riepilogo(
    completed: list[str],
    skipped: list[str],
    failed: list[str],
) -> None:
    print()
    print("=== Riepilogo ===")
    print(
        f"  Completati: {len(completed)}"
        + (f" ({', '.join(completed)})" if completed else "")
    )
    print(
        f"  Saltati:    {len(skipped)}"
        + (f" ({', '.join(skipped)})" if skipped else "")
    )
    print(
        f"  Errori:     {len(failed)}"
        + (f" ({', '.join(failed)})" if failed else "")
    )
    print()
    print("=== Orchestrazione terminata ===")


def main() -> None:
    require_interactive_tty("python app/lib/scraping/run_all_scrapers.py")

    print()
    print("=== Orchestratore scraping cataloghi ===")
    print(f"E-commerce in coda: {len(SCRAPERS)}")
    for index, scraper in enumerate(SCRAPERS, start=1):
        note = scraper.get("note", "")
        suffix = f" — {note}" if note else ""
        print(f"  {index}. {scraper['name']}{suffix}")

    mode = prompt_orchestrator_mode()
    if mode == "frecciarossa":
        print()
        print("Modalità: FRECCIAROSSA")
        run_frecciarossa()
    else:
        print()
        print("Modalità: REGIONALE")
        run_regionale()


if __name__ == "__main__":
    main()
