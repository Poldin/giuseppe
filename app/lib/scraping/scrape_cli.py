"""Helper CLI condivisi per scraper e orchestratore."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def prompt_yes_no(message: str, *, default: bool = True) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        raw = input(f"{message} [{hint}] ").strip().lower()
        if raw in ("", "y", "yes", "s", "si", "sì"):
            return True if raw != "" or default else False
        if raw in ("n", "no"):
            return False
        print('Rispondi "y" (sì) o "n" (no).')


def parse_config_path(argv: list[str] | None = None) -> Path | None:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument(
        "--config",
        metavar="PATH",
        help="JSON di configurazione: se presente, nessuno prompt interattivo",
    )
    args = parser.parse_args(argv)
    if not args.config:
        return None
    return Path(args.config)


def load_config(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"config non valida (atteso oggetto JSON): {path}")
    return data


def require_interactive_tty(script_hint: str) -> None:
    if sys.stdin.isatty():
        return

    print()
    print("Questo script chiede input interattivo.")
    print("Non puoi rispondere dalla scheda Output / Code Runner.")
    print()
    print("Apri il Terminale integrato (Ctrl+`) e lancia:")
    print(f"  {script_hint}")
    print()
    sys.exit(1)
