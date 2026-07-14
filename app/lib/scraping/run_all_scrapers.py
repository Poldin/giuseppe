"""
Orchestratore scraping cataloghi e-commerce.

Esegue gli scraper uno alla volta, chiedendo conferma prima di ciascuno.
Per aggiungere un e-commerce: inserisci una voce in SCRAPERS sotto.

Uso (dal terminale integrato):
  python app/lib/scraping/run_all_scrapers.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRAPING_DIR = Path(__file__).resolve().parent

# Aggiungi qui i nuovi e-commerce man mano che crei gli scraper.
SCRAPERS: list[dict[str, str]] = [
    {
        "name": "Dentaltix",
        "script": "dentaltix_local_scraper.py",
        "note": "Materiale clinica dentale",
    },
    {
        "name": "Gerhò",
        "script": "gerho_local_scraper.py",
        "note": "Sezione STUDIO",
    },
]


def prompt_yes_no(message: str, *, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{message} [{hint}] ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return True if raw != "" or default else False
        if raw in ("n", "no"):
            return False
        print('Rispondi "y" (sì) o "n" (no).')


def ensure_tty() -> None:
    if sys.stdin.isatty():
        return

    print()
    print("Questo script richiede input interattivo.")
    print("Apri il Terminale integrato (Ctrl+`) e lancia:")
    print("  python app/lib/scraping/run_all_scrapers.py")
    print()
    sys.exit(1)


def run_scraper(script_name: str) -> int:
    script_path = SCRAPING_DIR / script_name
    if not script_path.is_file():
        print(f"ERRORE: script non trovato -> {script_path}")
        return 1

    return subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(SCRAPING_DIR),
    ).returncode


def main() -> None:
    ensure_tty()

    print()
    print("=== Orchestratore scraping cataloghi ===")
    print(f"E-commerce in coda: {len(SCRAPERS)}")
    for index, scraper in enumerate(SCRAPERS, start=1):
        note = scraper.get("note", "")
        suffix = f" — {note}" if note else ""
        print(f"  {index}. {scraper['name']}{suffix}")
    print()

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

    print()
    print("=== Riepilogo ===")
    print(f"  Completati: {len(completed)}" + (f" ({', '.join(completed)})" if completed else ""))
    print(f"  Saltati:    {len(skipped)}" + (f" ({', '.join(skipped)})" if skipped else ""))
    print(f"  Errori:     {len(failed)}" + (f" ({', '.join(failed)})" if failed else ""))
    print()
    print("=== Orchestrazione terminata ===")


if __name__ == "__main__":
    main()
