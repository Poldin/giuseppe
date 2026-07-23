"""
Orchestratore scraping cataloghi e-commerce + Ministero + docs fabbricante.

Due modalità:
  regionale   → conferma e domande dentro ogni scraper (sempre sequenziale)
  frecciarossa → tutte le domande all'inizio, poi run via --config
                 e-commerce (≥2) in parallelo; Ministero + docs in sequenza dopo

Uso (dal terminale integrato):
  python app/lib/scraping/run_all_scrapers.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from scrape_cli import prompt_yes_no, require_interactive_tty
from scrape_pages import page_plan_to_dict, prompt_page_plan, prompt_total_pages
from scrape_session import default_session_id

SCRAPING_DIR = Path(__file__).resolve().parent
LOGS_DIR = SCRAPING_DIR / "logs"

OrchestratorMode = Literal["regionale", "frecciarossa"]

ECOMMERCE_KEYS = frozenset({"dentaltix", "gerho", "dontalia"})
MINISTRY_KEYS = frozenset({"recalls_medical_device", "medical_devices"})
MANUFACTURER_DOCS_KEYS = frozenset(
    {"dentsply_sirona", "kerr_dental", "ivoclar", "gc_dental"}
)
STATUS_EVERY_SEC = 30
TAIL_LINES_ON_FAIL = 40

PlannedJob = tuple[dict[str, Any], dict[str, Any]]


@dataclass
class ParallelJobResult:
    name: str
    key: str
    exit_code: int
    log_path: Path
    elapsed_sec: float

# Aggiungi qui i nuovi job man mano che crei gli scraper.
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
    {
        "key": "recalls_medical_device",
        "name": "Recalls Ministero",
        "script": "recalls_medical_device_scraper.py",
        "note": "Avvisi di sicurezza dispositivi medici",
        "catalog_url": None,
        "routes": None,
    },
    {
        "key": "medical_devices",
        "name": "Medical Devices Ministero",
        "script": "medical_devices_update.py",
        "note": "Repertorio DM — import JSON CND odontoiatrici",
        "catalog_url": None,
        "routes": None,
    },
    # --- manufacturer docs (/docs/[slug]) — sempre in coda, conferma richiesta ---
    {
        "key": "dentsply_sirona",
        "name": "Dentsply Sirona docs",
        "script": "manufacturer_docs/dentsply_sirona_scraper.py",
        "note": "Download Center IT → manufacturer_documents",
        "catalog_url": None,
        "routes": None,
    },
    {
        "key": "kerr_dental",
        "name": "Kerr Dental docs",
        "script": "manufacturer_docs/kerr_dental_scraper.py",
        "note": "Download Center IT (Playwright) → manufacturer_documents",
        "catalog_url": None,
        "routes": None,
    },
    {
        "key": "ivoclar",
        "name": "Ivoclar docs",
        "script": "manufacturer_docs/ivoclar_scraper.py",
        "note": "Download Center IT (DAM) → manufacturer_documents",
        "catalog_url": None,
        "routes": None,
    },
    {
        "key": "gc_dental",
        "name": "GC Dental docs",
        "script": "manufacturer_docs/gc_dental_scraper.py",
        "note": "SDS GC Europe IT → manufacturer_documents",
        "catalog_url": None,
        "routes": None,
    },
]


def prompt_orchestrator_mode() -> OrchestratorMode:
    print()
    print("Modalità treno:")
    print('  Invio / "r" → regionale  (domande durante ogni scraper, come oggi)')
    print('  "f"         → frecciarossa (domande subito; e-commerce in parallelo)')

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


def prompt_recalls_config() -> dict[str, Any]:
    print()
    print("--- Configurazione Recalls Ministero ---")
    full = prompt_yes_no(
        "Recalls: backfill completo (--full: scorri tutto, no early-stop)?",
        default=False,
    )

    print()
    print("Recalls: limite massimo avvisi dall'indice? (smoke test)")
    print("  Invio      → nessun limite")
    print("  Numero N   → al massimo N avvisi")
    while True:
        raw = input("> ").strip().lower()
        if raw == "":
            limit: int | None = None
            break
        if raw.isdigit():
            value = int(raw)
            if value >= 1:
                limit = value
                break
            print("Inserisci un numero >= 1.")
            continue
        print("Inserisci un numero >= 1 oppure Invio per nessun limite.")

    if full:
        return {"full": True, "limit": limit, "stop_after_dupes": 10}

    print()
    print("Recalls: stop dopo quanti duplicati consecutivi? (default 10)")
    print("  Invio      → 10")
    print("  Numero N   → stop dopo N duplicati consecutivi")
    while True:
        raw = input("> ").strip().lower()
        if raw == "":
            stop_after = 10
            break
        if raw.isdigit():
            value = int(raw)
            if value >= 1:
                stop_after = value
                break
            print("Inserisci un numero >= 1.")
            continue
        print("Inserisci un numero >= 1 oppure Invio per 10.")

    return {"full": False, "limit": limit, "stop_after_dupes": stop_after}


def prompt_medical_devices_config() -> dict[str, Any] | None:
    print()
    print("--- Configurazione Medical Devices Ministero ---")
    print("Inserisci uno o più path JSON (dump completo e/o variazioni settimanali).")
    print("  path       → aggiungi il file")
    print("  Invio      → conferma la lista (serve almeno un file)")
    print('  "skip"     → salta questo job')

    files: list[str] = []
    while True:
        raw = input("> ").strip().strip('"')
        if raw.lower() == "skip":
            return None
        if raw == "":
            if files:
                return {"files": files}
            print("Inserisci almeno un path JSON, oppure digita skip.")
            continue

        path = Path(raw)
        if not path.exists():
            print(f"File non trovato: {path}")
            continue
        if not path.is_file():
            print(f"Non è un file: {path}")
            continue
        files.append(str(path.resolve()))
        print(f"  + {path}  (totale {len(files)})")


def prompt_dentsply_docs_config() -> dict[str, Any]:
    print()
    print("--- Configurazione Dentsply Sirona docs ---")
    print("pageSize per ogni filtro asset-type (una sola call, no offset)")
    print('  Invio / "y" → 10000 (catalogo completo IT)')
    print("  Numero N    → usa N (max 10000)")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"page_size": 10000}
        if raw.isdigit():
            value = int(raw)
            if 1 <= value <= 10_000:
                return {"page_size": value}
            print("Inserisci un numero tra 1 e 10000.")
            continue
        print("Invio per 10000, oppure un numero.")


def prompt_kerr_docs_config() -> dict[str, Any]:
    print()
    print("--- Configurazione Kerr Dental docs ---")
    print('  Invio / "y" → full catalog + upsert DB')
    print("  dry        → full senza upsert")
    print("  headed     → browser visibile + upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True, "out_json": "kerr_full_run.json"}
        if raw == "dry":
            return {"upsert": False, "out_json": "kerr_dry_full_run.json"}
        if raw == "headed":
            return {
                "headless": False,
                "upsert": True,
                "out_json": "kerr_full_run.json",
            }
        print("Invio, dry, o headed.")


def prompt_ivoclar_docs_config() -> dict[str, Any]:
    print()
    print("--- Configurazione Ivoclar docs ---")
    print('  Invio / "y" → full catalog + upsert DB')
    print("  dry        → full senza upsert")
    print("  smoke      → max 40 docs, no upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True, "out_json": "ivoclar_full_run.json"}
        if raw == "dry":
            return {"upsert": False, "out_json": "ivoclar_dry_full_run.json"}
        if raw == "smoke":
            return {
                "upsert": False,
                "max_docs": 40,
                "out_json": "ivoclar_smoke_run.json",
            }
        print("Invio / dry / smoke")


def prompt_gc_docs_config() -> dict[str, Any]:
    print()
    print("--- Configurazione GC Dental docs ---")
    print('  Invio / "y" → tutte le categorie + upsert DB')
    print("  dry        → tutte le categorie, no upsert")
    print("  smoke      → restore, max 12 prodotti, no upsert")
    while True:
        raw = input("> ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return {"upsert": True, "out_json": "gc_full_run.json"}
        if raw == "dry":
            return {"upsert": False, "out_json": "gc_dry_full_run.json"}
        if raw == "smoke":
            return {
                "upsert": False,
                "categories": ["restore"],
                "max_products": 12,
                "out_json": "gc_smoke_run.json",
            }
        print("Invio / dry / smoke")


def collect_frecciarossa_plan() -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Raccoglie config per ogni job abilitato. Ritorna [(scraper, config), ...]."""
    print()
    print("=== Questionario Frecciarossa ===")
    print("Rispondi a tutto ora: dopo non ti verrà chiesto nulla.")
    print()

    selected: list[dict[str, Any]] = []
    for scraper in SCRAPERS:
        if prompt_yes_no(f"Includere {scraper['name']}?"):
            selected.append(scraper)

    if not selected:
        print("Nessun job selezionato.")
        return []

    needs_session = any(scraper["key"] in ECOMMERCE_KEYS for scraper in selected)
    session_id = prompt_session_id_global() if needs_session else None
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
            assert session_id is not None
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

            assert session_id is not None
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

        if key == "recalls_medical_device":
            planned.append((scraper, prompt_recalls_config()))
            continue

        if key == "medical_devices":
            md_config = prompt_medical_devices_config()
            if md_config is None:
                print(f"Saltato: {name}")
                continue
            planned.append((scraper, md_config))
            continue

        if key == "dentsply_sirona":
            planned.append((scraper, prompt_dentsply_docs_config()))
            continue

        if key == "kerr_dental":
            planned.append((scraper, prompt_kerr_docs_config()))
            continue

        if key == "ivoclar":
            planned.append((scraper, prompt_ivoclar_docs_config()))
            continue

        if key == "gc_dental":
            planned.append((scraper, prompt_gc_docs_config()))
            continue

        print(f"ERRORE: job non gestito in frecciarossa: {key}")

    return planned


def print_frecciarossa_summary(planned: list[PlannedJob]) -> None:
    print()
    print("=== Riepilogo Frecciarossa ===")
    ecommerce = [s["name"] for s, _ in planned if s["key"] in ECOMMERCE_KEYS]
    ministry = [s["name"] for s, _ in planned if s["key"] in MINISTRY_KEYS]
    docs = [s["name"] for s, _ in planned if s["key"] in MANUFACTURER_DOCS_KEYS]
    if len(ecommerce) >= 2:
        seq_bits = []
        if ministry:
            seq_bits.append("Ministero")
        if docs:
            seq_bits.append("docs fabbricante")
        seq_txt = " + ".join(seq_bits) if seq_bits else "job sequenziali"
        print(
            f"  Parallelismo: e-commerce insieme "
            f"[{', '.join(ecommerce)}]; {seq_txt} in sequenza dopo"
        )
    elif ecommerce and (ministry or docs):
        print("  Ordine: e-commerce, poi Ministero/docs (sequenza)")
    session_ids: set[str] = set()
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
            session_ids.add(config["session_id"])
        elif scraper["key"] == "dontalia":
            routes = ", ".join(config["routes"])
            print(
                f"  • {name}: rotte [{routes}]; "
                f"start page {config['start_page']} (fino a vuota)"
            )
            session_ids.add(config["session_id"])
        elif scraper["key"] == "recalls_medical_device":
            if config.get("full"):
                mode = "full"
            else:
                mode = f"stop-after-dupes={config.get('stop_after_dupes', 10)}"
            limit = config.get("limit")
            limit_txt = f", limit={limit}" if limit is not None else ""
            print(f"  • {name}: {mode}{limit_txt}")
        elif scraper["key"] == "medical_devices":
            files = config.get("files") or []
            names = ", ".join(Path(item).name for item in files)
            print(f"  • {name}: {len(files)} file [{names}]")
        elif scraper["key"] == "dentsply_sirona":
            print(f"  • {name}: page_size={config.get('page_size', 10000)}")
        elif scraper["key"] == "kerr_dental":
            upsert = "upsert" if config.get("upsert") else "dry"
            headed = ", headed" if config.get("headless") is False else ""
            print(f"  • {name}: {upsert}{headed}")
        elif scraper["key"] == "ivoclar":
            if config.get("max_docs"):
                detail = f"smoke max_docs={config['max_docs']}"
            elif config.get("upsert"):
                detail = "upsert"
            else:
                detail = "dry"
            print(f"  • {name}: {detail}")
        elif scraper["key"] == "gc_dental":
            if config.get("max_products"):
                detail = f"smoke max_products={config['max_products']}"
            elif config.get("upsert"):
                detail = "upsert"
            else:
                detail = "dry"
            print(f"  • {name}: {detail}")
        else:
            print(f"  • {name}")
    if session_ids:
        print(f"  Session ID: {', '.join(sorted(session_ids))}")
    print()


def write_config_file(config: dict[str, Any]) -> Path:
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".json",
        prefix="scrape_config_",
        delete=False,
    )
    with handle:
        json.dump(config, handle, ensure_ascii=False, indent=2)
    return Path(handle.name)


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

    config_path = write_config_file(config)
    try:
        return subprocess.run(
            [sys.executable, str(script_path), "--config", str(config_path)],
            cwd=str(SCRAPING_DIR),
        ).returncode
    finally:
        config_path.unlink(missing_ok=True)


def run_scraper_to_log(
    script_name: str,
    config: dict[str, Any],
    log_path: Path,
) -> int:
    script_path = SCRAPING_DIR / script_name
    if not script_path.is_file():
        log_path.write_text(
            f"ERRORE: script non trovato -> {script_path}\n",
            encoding="utf-8",
        )
        return 1

    config_path = write_config_file(config)
    try:
        with log_path.open("w", encoding="utf-8", errors="replace") as log_fh:
            log_fh.write(f"# script: {script_name}\n")
            log_fh.write(f"# started: {datetime.now().isoformat(timespec='seconds')}\n")
            log_fh.write("#" + "-" * 60 + "\n")
            log_fh.flush()
            completed = subprocess.run(
                [sys.executable, str(script_path), "--config", str(config_path)],
                cwd=str(SCRAPING_DIR),
                stdout=log_fh,
                stderr=subprocess.STDOUT,
            )
            log_fh.write("#" + "-" * 60 + "\n")
            log_fh.write(
                f"# finished: {datetime.now().isoformat(timespec='seconds')} "
                f"exit={completed.returncode}\n"
            )
            return completed.returncode
    finally:
        config_path.unlink(missing_ok=True)


def tail_log(path: Path, max_lines: int = TAIL_LINES_ON_FAIL) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    return lines[-max_lines:]


def run_ecommerce_parallel(jobs: list[PlannedJob]) -> list[ParallelJobResult]:
    """Esegue i 3 e-commerce in parallelo; console = solo stato, dettagli su file."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = LOGS_DIR / f"frecciarossa_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    names = [scraper["name"] for scraper, _ in jobs]
    print()
    print(f"=== Onda parallela e-commerce ({len(jobs)}) ===")
    print(f"In corso insieme: {', '.join(names)}")
    print("Console: solo stato (niente log mischiati).")
    print(f"Dettagli per sito: {run_dir}")
    for scraper, _ in jobs:
        log_file = run_dir / f"{scraper['key']}.log"
        print(f"  • {scraper['name']}: {log_file}")
    print("-" * 50)

    results: dict[str, ParallelJobResult] = {}
    lock = threading.Lock()
    started_at = time.monotonic()

    def worker(scraper: dict[str, Any], config: dict[str, Any]) -> None:
        key = scraper["key"]
        name = scraper["name"]
        log_path = run_dir / f"{key}.log"
        job_started = time.monotonic()
        with lock:
            print(f"▶ START  {name}")
        try:
            exit_code = run_scraper_to_log(scraper["script"], config, log_path)
        except Exception as exc:  # noqa: BLE001 - non far crashare gli altri worker
            exit_code = 1
            with log_path.open("a", encoding="utf-8", errors="replace") as log_fh:
                log_fh.write(f"\nORCHESTRATOR ERROR: {type(exc).__name__}: {exc}\n")
        elapsed = time.monotonic() - job_started
        result = ParallelJobResult(
            name=name,
            key=key,
            exit_code=exit_code,
            log_path=log_path,
            elapsed_sec=elapsed,
        )
        with lock:
            results[key] = result
            status = "OK" if exit_code == 0 else f"ERR({exit_code})"
            print(f"■ DONE   {name}  [{status}]  {elapsed / 60:.1f} min  → {log_path.name}")

    threads = [
        threading.Thread(
            target=worker,
            args=(scraper, config),
            name=f"scrape-{scraper['key']}",
            daemon=True,
        )
        for scraper, config in jobs
    ]
    for thread in threads:
        thread.start()

    last_status_at = started_at
    while any(thread.is_alive() for thread in threads):
        for thread in threads:
            thread.join(timeout=1)
        now = time.monotonic()
        if now - last_status_at < STATUS_EVERY_SEC:
            continue
        if not any(thread.is_alive() for thread in threads):
            break
        last_status_at = now
        running = [
            scraper["name"]
            for scraper, _ in jobs
            if any(
                thread.name == f"scrape-{scraper['key']}" and thread.is_alive()
                for thread in threads
            )
        ]
        done = [scraper["name"] for scraper, _ in jobs if scraper["key"] in results]
        elapsed = now - started_at
        with lock:
            print(
                f"… status {elapsed / 60:.1f}m — "
                f"running: [{', '.join(running) or '-'}] | "
                f"done: [{', '.join(done) or '-'}]"
            )

    for thread in threads:
        thread.join()

    ordered = [results[scraper["key"]] for scraper, _ in jobs if scraper["key"] in results]
    print("-" * 50)
    print(f"Onda parallela terminata. Log: {run_dir}")
    for result in ordered:
        if result.exit_code == 0:
            continue
        print()
        print(f"--- Tail errore {result.name} ({result.log_path.name}) ---")
        for line in tail_log(result.log_path):
            print(line)
    return ordered


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
            "Continuare con il prossimo job?",
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

    ecommerce_jobs = [
        (scraper, config)
        for scraper, config in planned
        if scraper["key"] in ECOMMERCE_KEYS
    ]
    sequential_jobs = [
        (scraper, config)
        for scraper, config in planned
        if scraper["key"] not in ECOMMERCE_KEYS
    ]

    completed: list[str] = []
    failed: list[str] = []

    if ecommerce_jobs:
        if len(ecommerce_jobs) == 1:
            scraper, config = ecommerce_jobs[0]
            name = scraper["name"]
            print()
            print(f"--- {name} (frecciarossa, singolo) ---")
            print(f"Avvio scraper {name} senza ulteriori domande...")
            print("-" * 50)
            exit_code = run_scraper(scraper["script"], config)
            print("-" * 50)
            if exit_code == 0:
                print(f"Completato: {name}")
                completed.append(name)
            else:
                print(f"Terminato con errore (codice {exit_code}): {name}")
                failed.append(name)
        else:
            for result in run_ecommerce_parallel(ecommerce_jobs):
                if result.exit_code == 0:
                    completed.append(result.name)
                else:
                    failed.append(result.name)

        if failed and sequential_jobs:
            print()
            if not prompt_yes_no(
                "Alcuni e-commerce hanno fallito. Continuare con Ministero/docs?",
                default=False,
            ):
                print_riepilogo(completed, [], failed)
                return

    for index, (scraper, config) in enumerate(sequential_jobs, start=1):
        name = scraper["name"]
        print()
        print(
            f"--- [{index}/{len(sequential_jobs)}] {name} "
            f"(frecciarossa, sequenziale) ---"
        )
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

        if index < len(sequential_jobs) and not prompt_yes_no(
            "Continuare con il prossimo job?",
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
    print("=== Orchestratore scraping ===")
    print(f"Job in coda: {len(SCRAPERS)}")
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
