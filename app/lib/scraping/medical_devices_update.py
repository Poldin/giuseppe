"""
Import / update dispositivi medici (Repertorio Ministero della Salute).

Flusso:
  1. Legge uno o più JSON (dump completo o variazioni settimanali)
  2. Filtra per prefissi CND odontoiatrici
  3. Deduplica per progressivo_dm_ass (vince data_inizio_validita più recente)
  4. Upsert su medical_devices in batch da max 1000
  5. Se un progressivo compare negli update ma esce dallo scope CND → delete

Uso:
  python app/lib/scraping/medical_devices_update.py
  python app/lib/scraping/medical_devices_update.py path/al/dump.json
  python app/lib/scraping/medical_devices_update.py file1.json file2.json
  python app/lib/scraping/medical_devices_update.py a.json a.json  # path ripetuti: ok
  python app/lib/scraping/medical_devices_update.py --config path.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv
from supabase import Client, create_client

from scrape_cli import load_config, require_interactive_tty

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TABLE = "medical_devices"
BATCH_SIZE = 1000
# Dump completi: ignora fuori-scope. Sotto questa soglia = update settimanale.
LARGE_FILE_BYTES = 50 * 1024 * 1024

CND_PREFIXES = [
    "Q010101",
    "Q010102",
    "Q010103",
    "Q010104",
    "Q010201",
    "Q010202",
    "Q010203",
    "Q010301",
    "Q010302",
    "Q010303",
    "Q010401",
    "Q010402",
    "Q010403",
    "Q010404",
    "Q010501",
    "Q010502",
    "Q010503",
    "Q019001",
    "T010101",
    "T020101",
    "T030102",
    "T030201",
    "D0101",
    "D0102",
    "D0201",
]
CND_PREFIXES_SORTED = sorted({p.upper() for p in CND_PREFIXES}, key=len, reverse=True)


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def date_to_iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def match_cnd_prefix(code: str | None) -> str | None:
    normalized = (code or "").strip().upper()
    if not normalized:
        return None
    for prefix in CND_PREFIXES_SORTED:
        if normalized == prefix or normalized.startswith(prefix):
            return prefix
    return None


def slugify(text: str, max_len: int = 80) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if not text:
        text = "dispositivo"
    return text[:max_len].strip("-") or "dispositivo"


def build_slug(denominazione: str | None, progressivo: str) -> str:
    return f"{slugify(denominazione or 'dispositivo')}-{progressivo}"


def row_version_key(raw: dict[str, Any]) -> tuple[date, int]:
    """Più alto = versione preferita se lo stesso progressivo appare più volte."""
    inizio = parse_date(raw.get("data_inizio_validita")) or date.min
    fine = parse_date(raw.get("data_fine_validita"))
    open_ended = 1 if (fine is None or fine.year >= 9999) else 0
    return (inizio, open_ended)


def normalize_record(raw: dict[str, Any], source_file: str) -> dict[str, Any] | None:
    progressivo = str(raw.get("progressivo_dm_ass") or "").strip()
    if not progressivo:
        return None

    cnd = str(raw.get("classificazione_cnd") or "").strip().upper()
    prefix = match_cnd_prefix(cnd)
    denominazione = str(raw.get("denominazione_commerciale") or "").strip() or None

    return {
        "progressivo_dm_ass": progressivo,
        "tipologia_dm": str(raw.get("tipologia_dm") or "1").strip() or "1",
        "slug": build_slug(denominazione, progressivo),
        "denominazione_commerciale": denominazione,
        "fabbricante_assemblatore": (
            str(raw.get("fabbricante_assemblatore") or "").strip() or None
        ),
        "cod_fiscale": str(raw.get("cod_fiscale") or "").strip() or None,
        "partita_iva_vat": (
            str(raw.get("PARTITAIVA_VATNUMBER_MAND") or "").strip() or None
        ),
        "cod_catalogo_fabbr_ass": (
            str(raw.get("cod_catalogo_fabbr_ass") or "").strip() or None
        ),
        "classificazione_cnd": cnd or None,
        "cnd_prefix": prefix,
        "descrizione_cnd": str(raw.get("descrizione_cnd") or "").strip() or None,
        "iscrizione_repertorio": (
            str(raw.get("iscrizione_repertorio") or "").strip() or None
        ),
        "dm_riferimento": str(raw.get("dm_riferimento") or "").strip() or None,
        "gruppo_dm_simili": str(raw.get("gruppo_dm_simili") or "").strip() or None,
        "data_prima_pubblicazione": date_to_iso(
            parse_date(raw.get("data_prima_pubblicazione"))
        ),
        "data_inizio_validita": date_to_iso(parse_date(raw.get("data_inizio_validita"))),
        "data_fine_validita": date_to_iso(parse_date(raw.get("data_fine_validita"))),
        "data_fine_commercio": date_to_iso(parse_date(raw.get("data_fine_commercio"))),
        "last_source_file": source_file,
        "other": {
            "source": "dati.salute.gov.it",
            "in_scope": prefix is not None,
        },
        "_version": row_version_key(raw),
    }


def iter_json_array(path: Path) -> Iterator[dict[str, Any]]:
    """Stream dell'array JSON root senza caricare tutto in RAM."""
    decoder = json.JSONDecoder()
    with path.open("r", encoding="utf-8") as fh:
        buf = ""
        started = False
        while True:
            chunk = fh.read(1024 * 1024)
            if chunk:
                buf += chunk
            elif not buf:
                break

            if not started:
                buf = buf.lstrip()
                if not buf:
                    continue
                if not buf.startswith("["):
                    raise RuntimeError(f"{path}: JSON root non è un array")
                buf = buf[1:]
                started = True

            while True:
                buf = buf.lstrip()
                if buf.startswith(","):
                    buf = buf[1:].lstrip()
                if not buf:
                    break
                if buf.startswith("]"):
                    return
                try:
                    obj, idx = decoder.raw_decode(buf)
                except json.JSONDecodeError:
                    break
                if isinstance(obj, dict):
                    yield obj
                buf = buf[idx:]

            if not chunk:
                break

    raise RuntimeError(f"{path}: fine file inattesa durante lo stream JSON")


def merge_best(best: dict[str, dict[str, Any]], record: dict[str, Any]) -> None:
    key = record["progressivo_dm_ass"]
    prev = best.get(key)
    if prev is None or record["_version"] >= prev["_version"]:
        best[key] = record


def strip_internal(record: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in record.items() if not k.startswith("_")}


def fetch_existing_versions(progressivi: list[str]) -> dict[str, date | None]:
    """progressivo -> data_inizio_validita già in DB."""
    out: dict[str, date | None] = {}
    for i in range(0, len(progressivi), BATCH_SIZE):
        batch = progressivi[i : i + BATCH_SIZE]
        response = (
            supabase.table(TABLE)
            .select("progressivo_dm_ass, data_inizio_validita")
            .in_("progressivo_dm_ass", batch)
            .execute()
        )
        for row in response.data or []:
            key = str(row.get("progressivo_dm_ass") or "").strip()
            if not key:
                continue
            out[key] = parse_date(row.get("data_inizio_validita"))
    return out


def filter_newer_or_new(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """
    Evita regressioni: se in DB c'è già una data_inizio_validita più recente
    (o uguale), salta l'upsert. Utile se ripassi per errore un JSON più vecchio.
    """
    if not rows:
        return [], 0
    existing = fetch_existing_versions([r["progressivo_dm_ass"] for r in rows])
    accepted: list[dict[str, Any]] = []
    skipped = 0
    for row in rows:
        key = row["progressivo_dm_ass"]
        incoming = parse_date(row.get("data_inizio_validita"))
        current = existing.get(key)
        if key in existing:
            # già presente: non regressare con un file più vecchio
            if incoming is not None and current is not None and incoming < current:
                skipped += 1
                continue
            # stesso giorno di validità: ok aggiornare (refresh campi)
            # giorno più recente: ok aggiornare

        accepted.append(row)
    return accepted, skipped


def upsert_batches(rows: list[dict[str, Any]]) -> int:
    rows, skipped = filter_newer_or_new(rows)
    if skipped:
        log(f"Skip upsert (già aggiornati o file più vecchio): {skipped}")
    if not rows:
        log("Nessun record da upsert dopo il filtro versioni")
        return 0

    saved = 0
    total = len(rows)
    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        if len(batch) > BATCH_SIZE:
            raise RuntimeError("Batch size > 1000: abort")
        supabase.table(TABLE).upsert(
            batch,
            on_conflict="progressivo_dm_ass",
        ).execute()
        saved += len(batch)
        log(f"Upsert OK: {saved}/{total}")
    return saved


def existing_progressivi(candidates: list[str]) -> set[str]:
    """Ritorna solo i progressivi già presenti in DB (evita delete no-op di massa)."""
    found: set[str] = set()
    for i in range(0, len(candidates), BATCH_SIZE):
        batch = candidates[i : i + BATCH_SIZE]
        response = (
            supabase.table(TABLE)
            .select("progressivo_dm_ass")
            .in_("progressivo_dm_ass", batch)
            .execute()
        )
        for row in response.data or []:
            value = str(row.get("progressivo_dm_ass") or "").strip()
            if value:
                found.add(value)
    return found


def delete_batches(progressivi: list[str]) -> int:
    if not progressivi:
        return 0
    # Solo dispositivi che erano in tabella e ora escono dallo scope CND.
    present = existing_progressivi(progressivi)
    to_delete = [p for p in progressivi if p in present]
    if not to_delete:
        log(
            f"Delete fuori-scope: 0 effettivi "
            f"(candidati nel file: {len(progressivi)}, nessuno già in DB)"
        )
        return 0

    deleted = 0
    total = len(to_delete)
    for i in range(0, total, BATCH_SIZE):
        batch = to_delete[i : i + BATCH_SIZE]
        supabase.table(TABLE).delete().in_("progressivo_dm_ass", batch).execute()
        deleted += len(batch)
        log(f"Delete fuori-scope OK: {deleted}/{total}")
    return deleted


def unique_existing_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        key = str(path.resolve()).lower()
        if key in seen:
            log(f"Path duplicato ignorato: {path}")
            continue
        seen.add(key)
        if not path.exists():
            raise FileNotFoundError(path)
        if not path.is_file():
            raise RuntimeError(f"Non è un file: {path}")
        unique.append(path)
    return unique


def process_files(paths: list[Path]) -> None:
    unique_paths = unique_existing_paths(paths)
    if not unique_paths:
        raise RuntimeError("Nessun file da processare")

    best: dict[str, dict[str, Any]] = {}
    scanned = 0
    kept_raw = 0

    for path in unique_paths:
        large_dump = path.stat().st_size >= LARGE_FILE_BYTES
        log(
            f"Lettura {path.name} "
            f"({path.stat().st_size / (1024 * 1024):.1f} MB, "
            f"{'dump' if large_dump else 'update'})"
        )
        for raw in iter_json_array(path):
            scanned += 1
            if scanned % 200_000 == 0:
                log(f"  scansionati {scanned}, unici in-memoria {len(best)}")

            cnd = str(raw.get("classificazione_cnd") or "").strip().upper()
            prefix = match_cnd_prefix(cnd)
            if prefix is None and large_dump:
                continue

            record = normalize_record(raw, source_file=path.name)
            if record is None:
                continue
            kept_raw += 1
            merge_best(best, record)

        log(
            f"  fine {path.name}: scansionati={scanned}, "
            f"candidati_raw={kept_raw}, unici={len(best)}"
        )

    to_upsert = [
        strip_internal(row) for row in best.values() if row.get("cnd_prefix") is not None
    ]
    to_delete = [
        row["progressivo_dm_ass"]
        for row in best.values()
        if row.get("cnd_prefix") is None
    ]

    log(f"Record da upsert: {len(to_upsert)}")
    log(f"Record da delete (usciti dallo scope CND): {len(to_delete)}")

    if to_upsert:
        upsert_batches(to_upsert)
    if to_delete:
        delete_batches(to_delete)

    log("Done.")


def prompt_json_files() -> list[Path]:
    print()
    print("=== Configurazione Medical Devices (Repertorio) ===")
    print("Inserisci uno o più path JSON (dump completo e/o variazioni settimanali).")
    print("  path       → aggiungi il file")
    print("  Invio      → conferma la lista (serve almeno un file)")

    files: list[Path] = []
    while True:
        raw = input("> ").strip().strip('"')
        if raw == "":
            if files:
                return files
            print("Inserisci almeno un path JSON.")
            continue

        path = Path(raw)
        if not path.exists():
            print(f"File non trovato: {path}")
            continue
        if not path.is_file():
            print(f"Non è un file: {path}")
            continue
        files.append(path)
        print(f"  + {path}  (totale {len(files)})")


def run_from_config(config: dict[str, Any]) -> None:
    files_raw = config.get("files")
    if not isinstance(files_raw, list) or not files_raw:
        raise ValueError("config.files deve essere una lista non vuota di path")

    paths = [Path(str(item)) for item in files_raw]
    process_files(paths)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import/update medical_devices da JSON Ministero della Salute"
    )
    parser.add_argument(
        "--config",
        metavar="PATH",
        help="JSON di configurazione: se presente, nessuno prompt interattivo",
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Uno o più path JSON (dump completo e/o variazioni settimanali)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    log("=== medical_devices update ===")
    log(f"Tabella: {TABLE} | batch max: {BATCH_SIZE}")

    try:
        test = supabase.table(TABLE).select("id").limit(1).execute()
        log(f"Connessione Supabase OK (test: {len(test.data or [])} righe)")
    except Exception as exc:
        log(f"Connessione Supabase FALLITA -> {type(exc).__name__}: {exc}")
        sys.exit(1)

    if args.config:
        try:
            run_from_config(load_config(Path(args.config)))
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            log(f"Config non valida: {exc}")
            sys.exit(1)
        return

    if args.files:
        process_files([Path(item) for item in args.files])
        return

    require_interactive_tty("python app/lib/scraping/medical_devices_update.py")
    process_files(prompt_json_files())


if __name__ == "__main__":
    main()
