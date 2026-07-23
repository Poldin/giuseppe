#!/usr/bin/env python3
"""Dump scraped_product + upload product_combinations (truncate/rebuild).

Standalone: non tocca scrapers / search-engine.
Usage:
  python scripts/io_supabase.py dump
  python scripts/io_supabase.py upload
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PRODUCTS_PATH = DATA / "scraped_products.jsonl"
SHOPS_PATH = DATA / "ecommerce_brands.json"
COMBOS_PATH = DATA / "combinations.jsonl"

REPO_ROOT = ROOT.parents[1]
load_dotenv(REPO_ROOT / ".env.local")
load_dotenv(REPO_ROOT / ".env")

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
if not URL or not KEY:
    raise SystemExit("Mancano NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

sb = create_client(URL, KEY)

PAGE = 1000
UPLOAD_BATCH = 200


def dump_products() -> None:
    DATA.mkdir(parents=True, exist_ok=True)

    shops = (
        sb.table("ecommerce_brand")
        .select("id,name")
        .execute()
        .data
        or []
    )
    SHOPS_PATH.write_text(
        json.dumps(shops, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"OK shops {len(shops)} -> {SHOPS_PATH}", flush=True)

    select = (
        "id,product_name,brand,ecommerce_id,final_price,pub_slug,is_escluded"
    )
    total = 0
    offset = 0
    t0 = time.time()
    with PRODUCTS_PATH.open("w", encoding="utf-8") as f:
        while True:
            resp = (
                sb.table("scraped_product")
                .select(select)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                break
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            total += len(rows)
            offset += len(rows)
            print(f"  dumped {total}...", flush=True)
            if len(rows) < PAGE:
                break
    print(f"OK dump {total} -> {PRODUCTS_PATH} ({time.time() - t0:.1f}s)")


def truncate_tables() -> None:
    # Prefer RPC-less delete; tables start empty on first run.
    print("Truncating link_combinations_scraped_products...", flush=True)
    while True:
        resp = (
            sb.table("link_combinations_scraped_products")
            .delete()
            .gte("id", 0)
            .execute()
        )
        n = len(resp.data or [])
        print(f"  deleted links batch~{n}", flush=True)
        if n == 0:
            break
    print("Truncating product_combinations...", flush=True)
    while True:
        resp = (
            sb.table("product_combinations")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000")
            .execute()
        )
        n = len(resp.data or [])
        print(f"  deleted combinations batch~{n}", flush=True)
        if n == 0:
            break


def upload_combinations() -> None:
    if not COMBOS_PATH.exists():
        raise SystemExit(f"Manca {COMBOS_PATH}: esegui prima il binary Rust")

    truncate_tables()

    combos: list[dict] = []
    with COMBOS_PATH.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            combos.append(json.loads(line))

    print(f"Uploading {len(combos)} combinations…", flush=True)
    t0 = time.time()
    links_total = 0

    for i in range(0, len(combos), UPLOAD_BATCH):
        chunk = combos[i : i + UPLOAD_BATCH]
        combo_rows = [
            {"slug": c["slug"], "other": c["other"]} for c in chunk
        ]
        inserted = (
            sb.table("product_combinations")
            .insert(combo_rows)
            .execute()
            .data
            or []
        )
        if len(inserted) != len(chunk):
            raise SystemExit(
                f"Insert combinations mismatch: sent {len(chunk)} got {len(inserted)}"
            )

        link_rows = []
        for src, row in zip(chunk, inserted):
            cid = row["id"]
            link_rows.append(
                {"combination_id": cid, "scraped_product_id": src["product_a_id"]}
            )
            link_rows.append(
                {"combination_id": cid, "scraped_product_id": src["product_b_id"]}
            )

        sb.table("link_combinations_scraped_products").insert(link_rows).execute()
        links_total += len(link_rows)
        print(
            f"  {min(i + UPLOAD_BATCH, len(combos))}/{len(combos)} combos, "
            f"{links_total} links",
            flush=True,
        )

    print(
        f"OK upload {len(combos)} combinations, {links_total} links "
        f"({time.time() - t0:.1f}s)"
    )


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"dump", "upload"}:
        print(__doc__)
        raise SystemExit(2)
    cmd = sys.argv[1]
    if cmd == "dump":
        dump_products()
    else:
        upload_combinations()


if __name__ == "__main__":
    main()
