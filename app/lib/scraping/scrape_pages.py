from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class PagePlan:
    mode: Literal["range", "list"]
    pages: list[int]
    start_page: int = 1


def _parse_page_list(raw: str) -> list[int]:
    cleaned = raw.strip()
    if cleaned.startswith("[") and cleaned.endswith("]"):
        cleaned = cleaned[1:-1].strip()

    if not cleaned:
        raise ValueError("lista pagine vuota")

    pages: list[int] = []
    for part in cleaned.split(","):
        token = part.strip()
        if not token:
            continue
        if not re.fullmatch(r"\d+", token):
            raise ValueError(f"numero non valido: {token!r}")
        page = int(token)
        if page < 1:
            raise ValueError(f"pagina >= 1, ricevuto {page}")
        pages.append(page)

    if not pages:
        raise ValueError("lista pagine vuota")

    return sorted(set(pages))


def _looks_like_page_list(raw: str) -> bool:
    cleaned = raw.strip()
    return cleaned.startswith("[") or "," in cleaned


def prompt_page_plan() -> PagePlan:
    print()
    print("Quali pagine vuoi scrapare?")
    print('  Invio / "y" → dalla pagina 1 fino alla fine (ti chiederò il totale)')
    print("  Numero N    → dalla pagina N fino alla fine")
    print("  [2,4,8]     → solo le pagine indicate (anche [2] per una sola pagina)")

    while True:
        raw = input("> ").strip()
        lowered = raw.lower()

        if _looks_like_page_list(raw):
            try:
                pages = _parse_page_list(raw)
                return PagePlan(mode="list", pages=pages)
            except ValueError as exc:
                print(f"Lista non valida: {exc}")
                continue

        if lowered in ("", "y", "yes", "s", "si", "sì"):
            return PagePlan(mode="range", pages=[], start_page=1)

        if re.fullmatch(r"\d+", raw):
            start = int(raw)
            if start < 1:
                print("Inserisci un numero >= 1.")
                continue
            return PagePlan(mode="range", pages=[], start_page=start)

        print('Inserisci un numero, una lista tipo [2,4,8], oppure Invio per partire da 1.')


def prompt_total_pages(catalog_hint: str) -> int:
    print()
    print(f"Apri {catalog_hint} nel browser e controlla quante pagine ci sono in totale.")
    while True:
        raw = input("Quante sono le pagine totali? ").strip()
        try:
            total = int(raw)
            if total >= 1:
                return total
            print("Inserisci un numero >= 1.")
        except ValueError:
            print("Numero non valido, riprova.")


def resolve_pages(plan: PagePlan, total_pages: int | None = None) -> list[int]:
    if plan.mode == "list":
        return plan.pages

    if total_pages is None:
        raise ValueError("modalità range: servono le pagine totali")

    if plan.start_page > total_pages:
        raise ValueError(
            f"pagina di partenza {plan.start_page} oltre il totale ({total_pages})"
        )

    return list(range(plan.start_page, total_pages + 1))


def page_plan_to_dict(plan: PagePlan) -> dict:
    return {
        "mode": plan.mode,
        "pages": list(plan.pages),
        "start_page": plan.start_page,
    }


def page_plan_from_dict(data: dict) -> PagePlan:
    mode = data.get("mode")
    if mode not in ("range", "list"):
        raise ValueError(f"page_plan.mode non valido: {mode!r}")

    pages_raw = data.get("pages", [])
    if not isinstance(pages_raw, list):
        raise ValueError("page_plan.pages deve essere una lista")
    pages = [int(page) for page in pages_raw]

    start_page = int(data.get("start_page", 1))
    if start_page < 1:
        raise ValueError(f"page_plan.start_page >= 1, ricevuto {start_page}")

    if mode == "list" and not pages:
        raise ValueError("page_plan in modalità list richiede almeno una pagina")

    return PagePlan(mode=mode, pages=pages, start_page=start_page)
