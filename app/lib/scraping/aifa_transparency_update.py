"""
Import Liste di trasparenza AIFA (farmaci equivalenti) su Supabase.

Flusso:
  1. Accetta uno o più path (CSV, cartella con CSV, o ZIP)
  2. Deriva published_on dal path (es. .../2026-07-15_liste_farmaci_equivalenti/...)
  3. Ordina i file dal più vecchio al più recente
  4. Upsert dimensioni (principio, ATC, ditta, gruppo) + medicines
  5. Storico prezzi SPARSO: inserisce solo al primo visto o se cambiano prezzi/nota/gruppo
  6. Dopo l'ultimo release della run: soft-deactivate AIC assenti da quel file

Uso:
  python app/lib/scraping/aifa_transparency_update.py ^
    "C:\\Users\\hp\\Downloads\\2026-07-15_liste_farmaci_equivalenti"

  python app/lib/scraping/aifa_transparency_update.py ^
    "C:\\Users\\hp\\Downloads\\2026-07-15_liste_farmaci_equivalenti\\Lista_farmaci_equivalenti.csv"

  python app/lib/scraping/aifa_transparency_update.py path1 path2 path3

  python app/lib/scraping/aifa_transparency_update.py --force path1
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import os
import re
import sys
import unicodedata
import zipfile
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Mancano NEXT_PUBLIC_SUPABASE_URL e una key "
        "(SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 500
DATE_IN_PATH_RE = re.compile(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)")
ITALIAN_MONTHS = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}

CSV_CANDIDATE_NAMES = (
    "lista_farmaci_equivalenti.csv",
    "liste_farmaci_equivalenti.csv",
    "lista di trasparenza.csv",
)

# CSV secondari presenti negli ZIP AIFA — non usare come fonte principale
CSV_SKIP_SUBSTRINGS = (
    "prezzo_uguale",
    "unici_del_raggruppamento",
    "nome_commerciale",
    "principio_attivo",
)


def _csv_preference_score(name: str) -> int:
    """Più alto = migliore. Preferisci Lista_farmaci_equivalenti.csv esatto."""
    low = Path(name).name.lower()
    if any(skip in low for skip in CSV_SKIP_SUBSTRINGS):
        return -100
    if low in CSV_CANDIDATE_NAMES:
        return 100
    if "equivalenti" in low and low.endswith(".csv"):
        return 50
    if "trasparenza" in low and low.endswith(".csv"):
        return 40
    if low.endswith(".csv"):
        return 10
    return 0


def pick_best_csv_name(names: list[str]) -> str | None:
    scored = [( _csv_preference_score(n), n) for n in names]
    scored = [s for s in scored if s[0] > 0]
    if not scored:
        return None
    scored.sort(key=lambda x: (-x[0], x[1].lower()))
    return scored[0][1]


@dataclass(frozen=True)
class SourceFile:
    path: Path
    published_on: date
    label: str


@dataclass
class ParsedRow:
    principio: str
    reference_pack: str
    atc: str
    aic: str
    farmaco: str
    confezione: str
    ditta: str
    prezzo_rif: Decimal | None
    prezzo_pub: Decimal | None
    differenza: Decimal | None
    nota: str | None
    gruppo: str


def log(message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    safe = message.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    print(f"[{ts}] {safe}", flush=True)


def slugify(text: str, max_len: int = 90) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if not text:
        text = "n-a"
    return text[:max_len].strip("-") or "n-a"


def parse_price(value: str | None) -> Decimal | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # "5,63 €" / "5,63 \x80" / "5.63" → digits only with decimal comma/dot
    text = text.replace("€", "").replace("\u00a0", " ").strip()
    text = re.sub(r"[^\d,.\-]", "", text)
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        # 1.234,56 → european
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return Decimal(text).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def file_checksum(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def extract_date_from_path(path: Path) -> date | None:
    # Prefer folder names like 2026-07-15_liste_farmaci_equivalenti
    for part in reversed(path.parts):
        m = DATE_IN_PATH_RE.search(part)
        if m:
            try:
                return date.fromisoformat(m.group(1))
            except ValueError:
                continue
    return None


def extract_date_from_header(fieldnames: list[str]) -> date | None:
    for name in fieldnames:
        # "Prezzo Pubblico 15 luglio 2026"
        m = re.search(
            r"prezzo\s+pubblico\s+(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})",
            name,
            flags=re.IGNORECASE,
        )
        if not m:
            continue
        day = int(m.group(1))
        month = ITALIAN_MONTHS.get(m.group(2).lower())
        year = int(m.group(3))
        if month:
            return date(year, month, day)
    return None


def read_csv_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("cp1252", "latin-1", "utf-8-sig", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp1252", errors="replace")


def find_csv_in_dir(folder: Path) -> Path | None:
    files = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".csv"]
    if not files:
        return None
    best = pick_best_csv_name([p.name for p in files])
    if not best:
        return sorted(files)[0]
    for p in files:
        if p.name == best or p.name.lower() == best.lower():
            return p
    return sorted(files)[0]


def extract_csv_from_zip(zip_path: Path, work_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        csv_members = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not csv_members:
            raise ValueError(f"Nessun CSV nello ZIP: {zip_path}")
        member = pick_best_csv_name(csv_members) or csv_members[0]
        target = work_dir / Path(member).name
        with zf.open(member) as src, target.open("wb") as dst:
            dst.write(src.read())
        log(f"  zip→ csv scelto: {Path(member).name}")
        return target


def resolve_sources(raw_paths: list[str], date_override: date | None) -> list[SourceFile]:
    sources: list[SourceFile] = []
    tmp_root = ROOT_DIR / ".tmp" / "aifa_csv"
    for raw in raw_paths:
        path = Path(raw).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(f"Path non trovato: {path}")

        csv_path: Path
        if path.is_dir():
            found = find_csv_in_dir(path)
            if not found:
                raise FileNotFoundError(f"Nessun CSV in cartella: {path}")
            csv_path = found
            published = date_override or extract_date_from_path(path) or extract_date_from_path(csv_path)
            label = path.name
        elif path.suffix.lower() == ".zip":
            published = date_override or extract_date_from_path(path)
            extract_dir = tmp_root / (published.isoformat() if published else path.stem)
            csv_path = extract_csv_from_zip(path, extract_dir)
            published = published or extract_date_from_path(csv_path)
            label = path.name
        elif path.suffix.lower() == ".csv":
            csv_path = path
            published = (
                date_override
                or extract_date_from_path(path)
                or extract_date_from_path(path.parent)
            )
            label = path.name
        else:
            raise ValueError(f"Formato non supportato (usa csv/zip/cartella): {path}")

        if published is None:
            # last chance: peek header
            text = read_csv_text(csv_path)
            reader = csv.reader(io.StringIO(text), delimiter=";")
            header = next(reader, [])
            published = extract_date_from_header(header)

        if published is None:
            raise ValueError(
                f"Impossibile ricavare la data di pubblicazione da: {path}. "
                "Usa una cartella tipo 2026-07-15_liste_farmaci_equivalenti "
                "oppure passa --date YYYY-MM-DD"
            )

        sources.append(SourceFile(path=csv_path, published_on=published, label=label))

    # Dedup by published_on keeping last path order, then sort ascending
    by_date: dict[date, SourceFile] = {}
    for src in sources:
        by_date[src.published_on] = src
    return sorted(by_date.values(), key=lambda s: s.published_on)


def col_by_prefixes(fieldnames: list[str], *prefixes: str) -> str | None:
    lowered = {f.lower().strip(): f for f in fieldnames}
    for prefix in prefixes:
        p = prefix.lower()
        for low, original in lowered.items():
            if low == p or low.startswith(p):
                return original
    return None


def parse_csv(path: Path) -> tuple[list[ParsedRow], date | None, list[str]]:
    text = read_csv_text(path)
    sample = text[:4096]
    # AIFA usa ';'; alcuni export potrebbero usare ','
    delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError(f"CSV senza header: {path}")

    fields = [f.strip() for f in reader.fieldnames]
    # DictReader keys may have spaces; normalize access via map
    field_map = {f.strip(): f for f in reader.fieldnames}

    def get(row: dict[str, str], canonical: str) -> str:
        key = field_map.get(canonical, canonical)
        return (row.get(key) or "").strip()

    c_principio = col_by_prefixes(fields, "principio attivo")
    c_ref = col_by_prefixes(fields, "confezione di riferimento")
    c_atc = col_by_prefixes(fields, "atc")
    c_aic = col_by_prefixes(fields, "aic")
    c_farmaco = col_by_prefixes(fields, "farmaco")
    c_conf = col_by_prefixes(fields, "confezione")
    # "Confezione" vs "Confezione di riferimento" — prefer exact "confezione"
    for f in fields:
        if f.lower().strip() == "confezione":
            c_conf = f
            break
    c_ditta = col_by_prefixes(fields, "ditta")
    c_rif = col_by_prefixes(fields, "prezzo riferimento")
    c_pub = col_by_prefixes(fields, "prezzo pubblico")
    c_diff = col_by_prefixes(fields, "differenza")
    c_nota = col_by_prefixes(fields, "nota")
    c_gruppo = col_by_prefixes(fields, "codice gruppo equivalenza", "gruppo equivalenza")

    missing = [
        name
        for name, col in [
            ("Principio attivo", c_principio),
            ("ATC", c_atc),
            ("AIC", c_aic),
            ("Farmaco", c_farmaco),
            ("Ditta", c_ditta),
            ("Codice gruppo equivalenza", c_gruppo),
        ]
        if not col
    ]
    if missing:
        raise ValueError(f"Colonne mancanti in {path.name}: {missing}. Trovate: {fields}")

    header_date = extract_date_from_header(fields)
    rows: list[ParsedRow] = []
    issues: list[str] = []

    for i, raw in enumerate(reader, start=2):
        aic = re.sub(r"\D", "", get(raw, c_aic or "AIC"))
        if not aic:
            issues.append(f"riga {i}: AIC vuoto")
            continue

        principio = get(raw, c_principio or "")
        atc = get(raw, c_atc or "").upper()
        farmaco = get(raw, c_farmaco or "")
        ditta = get(raw, c_ditta or "")
        gruppo = get(raw, c_gruppo or "").upper()
        if not (principio and atc and farmaco and ditta and gruppo):
            issues.append(f"riga {i} AIC {aic}: campi obbligatori mancanti")
            continue

        conf_val = get(raw, c_conf or "Confezione") if c_conf else ""
        # strip excessive quotes from pack field
        conf_val = conf_val.replace('""', '"').strip()
        if conf_val.startswith('"') and conf_val.endswith('"'):
            conf_val = conf_val[1:-1].strip()

        rows.append(
            ParsedRow(
                principio=principio,
                reference_pack=get(raw, c_ref or "") if c_ref else "",
                atc=atc,
                aic=aic,
                farmaco=farmaco,
                confezione=conf_val,
                ditta=ditta,
                prezzo_rif=parse_price(get(raw, c_rif) if c_rif else None),
                prezzo_pub=parse_price(get(raw, c_pub) if c_pub else None),
                differenza=parse_price(get(raw, c_diff) if c_diff else None),
                nota=(get(raw, c_nota) if c_nota else "") or None,
                gruppo=gruppo,
            )
        )

    return rows, header_date, issues


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def upsert_batches(table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
    if not rows:
        return
    for batch in chunked(rows, BATCH_SIZE):
        supabase.table(table).upsert(batch, on_conflict=on_conflict).execute()


def fetch_id_map(table: str, key_col: str, keys: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    unique = sorted(set(keys))
    for i in range(0, len(unique), BATCH_SIZE):
        batch = unique[i : i + BATCH_SIZE]
        resp = (
            supabase.table(table)
            .select(f"id,{key_col}")
            .in_(key_col, batch)
            .execute()
        )
        for row in resp.data or []:
            result[str(row[key_col])] = str(row["id"])
    return result


def fetch_medicines_by_aic(aics: list[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    unique = sorted(set(aics))
    for i in range(0, len(unique), BATCH_SIZE):
        batch = unique[i : i + BATCH_SIZE]
        resp = (
            supabase.table("aifa_medicines")
            .select(
                "id,aic,prezzo_riferimento_ssn,prezzo_pubblico,differenza,nota,"
                "equivalence_group_id,release_id,first_release_id,is_active"
            )
            .in_("aic", batch)
            .execute()
        )
        for row in resp.data or []:
            result[str(row["aic"])] = row
    return result


def fetch_group_code_by_id(group_ids: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    unique = sorted({g for g in group_ids if g})
    for i in range(0, len(unique), BATCH_SIZE):
        batch = unique[i : i + BATCH_SIZE]
        resp = (
            supabase.table("aifa_equivalence_groups")
            .select("id,code")
            .in_("id", batch)
            .execute()
        )
        for row in resp.data or []:
            result[str(row["id"])] = str(row["code"])
    return result


def get_existing_release(published_on: date) -> dict[str, Any] | None:
    resp = (
        supabase.table("aifa_releases")
        .select("*")
        .eq("published_on", published_on.isoformat())
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return None


def get_latest_release_date() -> date | None:
    resp = (
        supabase.table("aifa_releases")
        .select("published_on")
        .order("published_on", desc=True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return date.fromisoformat(str(resp.data[0]["published_on"]))


def as_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def snapshot_key(
    prezzo_rif: Decimal | None,
    prezzo_pub: Decimal | None,
    differenza: Decimal | None,
    nota: str | None,
    gruppo: str | None,
) -> tuple[Decimal | None, Decimal | None, Decimal | None, str | None, str | None]:
    return (prezzo_rif, prezzo_pub, differenza, nota or None, (gruppo or None))


def ensure_unique_slugs(
    items: list[tuple[str, str]],
) -> dict[str, str]:
    """
    items: list of (natural_key, desired_slug)
    returns natural_key -> unique slug
    """
    used: set[str] = set()
    out: dict[str, str] = {}
    for key, base in items:
        slug = base
        n = 2
        while slug in used:
            slug = f"{base}-{n}"
            n += 1
        used.add(slug)
        out[key] = slug
    return out


def fetch_name_slug_maps(table: str) -> tuple[dict[str, str], set[str]]:
    """Carica name→slug e set di slug già usati (paginato)."""
    name_to_slug: dict[str, str] = {}
    used_slugs: set[str] = set()
    offset = 0
    while True:
        resp = (
            supabase.table(table)
            .select("name,slug")
            .range(offset, offset + BATCH_SIZE - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            name = str(row["name"])
            slug = str(row["slug"])
            name_to_slug[name] = slug
            used_slugs.add(slug)
        if len(rows) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
    return name_to_slug, used_slugs


def resolve_slugs_against_db(names: list[str], table: str) -> dict[str, str]:
    """
    Per ogni name: riusa slug DB se il name esiste già;
    altrimenti genera slug evitando collisioni con slug già presenti.
    """
    existing_name_to_slug, used_slugs = fetch_name_slug_maps(table)
    out: dict[str, str] = {}
    for name in names:
        if name in existing_name_to_slug:
            out[name] = existing_name_to_slug[name]
            continue
        base = slugify(name)
        slug = base
        n = 2
        while slug in used_slugs:
            slug = f"{base}-{n}"
            n += 1
        used_slugs.add(slug)
        out[name] = slug
    return out


def deactivate_missing(active_aics: set[str]) -> int:
    """Marca is_active=false per AIC non presenti nell'ultimo release importato."""
    to_deactivate: list[str] = []
    offset = 0
    while True:
        resp = (
            supabase.table("aifa_medicines")
            .select("aic")
            .eq("is_active", True)
            .range(offset, offset + BATCH_SIZE - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            aic = str(row["aic"])
            if aic not in active_aics:
                to_deactivate.append(aic)
        if len(rows) < BATCH_SIZE:
            break
        offset += BATCH_SIZE

    now = datetime.utcnow().isoformat()
    for i in range(0, len(to_deactivate), BATCH_SIZE):
        batch = to_deactivate[i : i + BATCH_SIZE]
        supabase.table("aifa_medicines").update(
            {"is_active": False, "updated_at": now}
        ).in_("aic", batch).execute()
    return len(to_deactivate)


def seed_price_cursor_from_history_before(
    aics: list[str], before: date
) -> dict[str, tuple]:
    """
    Ultimo punto storico con published_on < before (per backfill fuori ordine).
    """
    cursor: dict[str, tuple] = {}
    unique = sorted(set(aics))
    for i in range(0, len(unique), BATCH_SIZE):
        batch = unique[i : i + BATCH_SIZE]
        resp = (
            supabase.table("aifa_medicine_price_history")
            .select(
                "aic,published_on,prezzo_riferimento_ssn,prezzo_pubblico,"
                "differenza,nota,equivalence_group_code"
            )
            .in_("aic", batch)
            .lt("published_on", before.isoformat())
            .order("published_on", desc=True)
            .execute()
        )
        for row in resp.data or []:
            aic = str(row["aic"])
            if aic in cursor:
                continue  # già il più recente grazie all'order desc
            cursor[aic] = snapshot_key(
                as_decimal(row.get("prezzo_riferimento_ssn")),
                as_decimal(row.get("prezzo_pubblico")),
                as_decimal(row.get("differenza")),
                row.get("nota"),
                row.get("equivalence_group_code"),
            )
    return cursor


def import_release(
    src: SourceFile,
    *,
    force: bool,
    price_cursor: dict[str, tuple],
    is_latest_in_run: bool,
) -> dict[str, int]:
    log(f"=== {src.published_on.isoformat()} ← {src.path}")
    rows, header_date, issues = parse_csv(src.path)
    if header_date and header_date != src.published_on:
        log(
            f"  nota: data header CSV ({header_date}) ≠ data path ({src.published_on}); "
            "uso data dal path"
        )
    if issues:
        log(f"  warning parse: {len(issues)} (mostro max 5)")
        for msg in issues[:5]:
            log(f"    - {msg}")

    checksum = file_checksum(src.path)
    existing = get_existing_release(src.published_on)
    if existing and existing.get("file_checksum") == checksum and not force:
        log("  skip: release già importato con stesso checksum (usa --force per rielaborare)")
        # Aggiorna comunque il cursore dai prezzi del file, così i file successivi confrontano bene
        for r in rows:
            price_cursor[r.aic] = snapshot_key(
                r.prezzo_rif, r.prezzo_pub, r.differenza, r.nota, r.gruppo
            )
        return {"skipped": 1, "rows": len(rows)}

    latest_db = get_latest_release_date()
    apply_as_current = latest_db is None or src.published_on >= latest_db

    release_payload = {
        "published_on": src.published_on.isoformat(),
        "source_path": str(src.path),
        "source_file_name": src.path.name,
        "file_checksum": checksum,
        "row_count": len(rows),
        "imported_at": datetime.utcnow().isoformat(),
        "other": {
            "label": src.label,
            "header_date": header_date.isoformat() if header_date else None,
        },
    }
    if existing:
        release_id = str(existing["id"])
        supabase.table("aifa_releases").update(release_payload).eq("id", release_id).execute()
    else:
        resp = supabase.table("aifa_releases").insert(release_payload).execute()
        release_id = str(resp.data[0]["id"])

    now = datetime.utcnow().isoformat()

    principles = sorted({r.principio for r in rows})
    atcs = sorted({r.atc for r in rows})
    companies = sorted({r.ditta for r in rows})
    groups = sorted({r.gruppo for r in rows})

    principle_slugs = resolve_slugs_against_db(principles, "aifa_active_ingredients")
    company_slugs = resolve_slugs_against_db(companies, "aifa_companies")

    upsert_batches(
        "aifa_active_ingredients",
        [{"name": n, "slug": principle_slugs[n], "updated_at": now} for n in principles],
        "name",
    )
    upsert_batches(
        "aifa_atc_codes",
        [{"code": c, "slug": c.lower(), "updated_at": now} for c in atcs],
        "code",
    )
    upsert_batches(
        "aifa_companies",
        [{"name": n, "slug": company_slugs[n], "updated_at": now} for n in companies],
        "name",
    )

    principle_ids = fetch_id_map("aifa_active_ingredients", "name", principles)
    atc_ids = fetch_id_map("aifa_atc_codes", "code", atcs)
    company_ids = fetch_id_map("aifa_companies", "name", companies)

    group_meta: dict[str, ParsedRow] = {}
    for r in rows:
        group_meta.setdefault(r.gruppo, r)

    upsert_batches(
        "aifa_equivalence_groups",
        [
            {
                "code": code,
                "slug": code.lower(),
                "active_ingredient_id": principle_ids.get(meta.principio),
                "atc_code_id": atc_ids.get(meta.atc),
                "reference_pack_label": meta.reference_pack or None,
                "updated_at": now,
            }
            for code, meta in group_meta.items()
        ],
        "code",
    )
    group_ids = fetch_id_map("aifa_equivalence_groups", "code", groups)

    existing_meds = fetch_medicines_by_aic([r.aic for r in rows])
    existing_group_codes = fetch_group_code_by_id(
        [
            str(m["equivalence_group_id"])
            for m in existing_meds.values()
            if m.get("equivalence_group_id")
        ]
    )

    if apply_as_current:
        # Aggiornamento "in avanti": cursore da medicines correnti (pre-upsert)
        for aic, m in existing_meds.items():
            if aic in price_cursor:
                continue
            gid = m.get("equivalence_group_id")
            price_cursor[aic] = snapshot_key(
                as_decimal(m.get("prezzo_riferimento_ssn")),
                as_decimal(m.get("prezzo_pubblico")),
                as_decimal(m.get("differenza")),
                m.get("nota"),
                existing_group_codes.get(str(gid)) if gid else None,
            )
    else:
        # Backfill: NON usare medicines correnti (sono più recenti). Solo history < date.
        still_missing = [r.aic for r in rows if r.aic not in price_cursor]
        if still_missing:
            price_cursor.update(
                seed_price_cursor_from_history_before(still_missing, src.published_on)
            )

    medicine_rows: list[dict[str, Any]] = []
    for r in rows:
        medicine_rows.append(
            {
                "aic": r.aic,
                "slug": f"{slugify(r.farmaco)}-{r.aic}",
                "name": r.farmaco,
                "pack_description": r.confezione or None,
                "company_id": company_ids.get(r.ditta),
                "active_ingredient_id": principle_ids.get(r.principio),
                "equivalence_group_id": group_ids.get(r.gruppo),
                "atc_code_id": atc_ids.get(r.atc),
                "prezzo_riferimento_ssn": decimal_to_float(r.prezzo_rif),
                "prezzo_pubblico": decimal_to_float(r.prezzo_pub),
                "differenza": decimal_to_float(r.differenza),
                "nota": r.nota,
                "release_id": release_id,
                "is_active": True,
                "updated_at": now,
            }
        )

    for row in medicine_rows:
        prev = existing_meds.get(row["aic"])
        if prev and prev.get("first_release_id"):
            row["first_release_id"] = prev["first_release_id"]
        else:
            row["first_release_id"] = release_id

    if apply_as_current:
        upsert_batches("aifa_medicines", medicine_rows, "aic")
    else:
        missing_only = [m for m in medicine_rows if m["aic"] not in existing_meds]
        if missing_only:
            upsert_batches("aifa_medicines", missing_only, "aic")
        log(
            f"  release <= latest DB ({latest_db}): "
            f"niente overwrite corrente (+ {len(missing_only)} AIC nuovi)"
        )

    meds_after = fetch_medicines_by_aic([r.aic for r in rows])

    history_rows: list[dict[str, Any]] = []
    skipped_unchanged = 0
    for r in rows:
        med = meds_after.get(r.aic)
        if not med:
            continue
        key = snapshot_key(r.prezzo_rif, r.prezzo_pub, r.differenza, r.nota, r.gruppo)
        prev_key = price_cursor.get(r.aic)
        if prev_key == key:
            skipped_unchanged += 1
            continue

        history_rows.append(
            {
                "medicine_id": med["id"],
                "aic": r.aic,
                "release_id": release_id,
                "published_on": src.published_on.isoformat(),
                "prezzo_riferimento_ssn": decimal_to_float(r.prezzo_rif),
                "prezzo_pubblico": decimal_to_float(r.prezzo_pub),
                "differenza": decimal_to_float(r.differenza),
                "nota": r.nota,
                "equivalence_group_code": r.gruppo,
            }
        )
        price_cursor[r.aic] = key

    upsert_batches("aifa_medicine_price_history", history_rows, "aic,release_id")

    deactivated = 0
    if apply_as_current and is_latest_in_run:
        deactivated = deactivate_missing({r.aic for r in rows})

    stats = {
        "rows": len(rows),
        "principles": len(principles),
        "groups": len(groups),
        "companies": len(companies),
        "atc": len(atcs),
        "history_inserted": len(history_rows),
        "history_skipped_unchanged": skipped_unchanged,
        "deactivated": deactivated,
        "parse_issues": len(issues),
    }
    log(
        f"  ok: {stats['rows']} AIC | gruppi {stats['groups']} | "
        f"history +{stats['history_inserted']} (skip invariati {stats['history_skipped_unchanged']}) | "
        f"disattivati {stats['deactivated']} | parse issues {stats['parse_issues']}"
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Liste di trasparenza AIFA")
    parser.add_argument(
        "paths",
        nargs="+",
        help="CSV, ZIP o cartelle (es. .../2026-07-15_liste_farmaci_equivalenti)",
    )
    parser.add_argument(
        "--date",
        dest="date_override",
        help="Forza published_on YYYY-MM-DD (solo se un unico path, o applica a tutti)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rielabora anche se checksum release già presente",
    )
    args = parser.parse_args()

    date_override = None
    if args.date_override:
        date_override = date.fromisoformat(args.date_override)

    # Smoke check tables
    try:
        supabase.table("aifa_releases").select("id").limit(1).execute()
    except Exception as exc:  # noqa: BLE001
        log(
            "ERRORE: tabella aifa_releases non raggiungibile. "
            "Esegui prima aifa_transparency_schema.sql su Supabase."
        )
        raise SystemExit(str(exc)) from exc

    sources = resolve_sources(args.paths, date_override)
    log(f"File da importare (ordinati cronologicamente): {len(sources)}")
    for s in sources:
        log(f"  - {s.published_on}  {s.path}")

    # Cursore prezzi in-memory: tra un file e l'altro della stessa run confronta
    # solo i cambi veri (storico sparso). Consigliato passare tutti i file storici insieme.
    price_cursor: dict[str, tuple] = {}

    totals = {
        "rows": 0,
        "history_inserted": 0,
        "deactivated": 0,
        "parse_issues": 0,
        "skipped": 0,
    }
    for i, src in enumerate(sources):
        stats = import_release(
            src,
            force=args.force,
            price_cursor=price_cursor,
            is_latest_in_run=(i == len(sources) - 1),
        )
        for k, v in stats.items():
            if k in totals:
                totals[k] += v

    log(
        f"FATTO. rows={totals['rows']} history+={totals['history_inserted']} "
        f"deactivated={totals['deactivated']} skipped_releases={totals['skipped']} "
        f"parse_issues={totals['parse_issues']}"
    )


if __name__ == "__main__":
    main()
