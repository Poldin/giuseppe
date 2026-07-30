#!/usr/bin/env python3
"""One-shot dump scraped_product -> local JSONL (then Rust works fully offline)."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

REPO = Path(__file__).resolve().parents[3]
load_dotenv(REPO / ".env.local")
load_dotenv(REPO / ".env")

OUT = Path(__file__).resolve().parents[1] / "data" / "scraped_products.jsonl"
OUT.parent.mkdir(parents=True, exist_ok=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
if not URL or not KEY:
    raise SystemExit("Missing Supabase env")

sb = create_client(URL, KEY)
PAGE = 1000
SELECT = "id,product_name,name_norm,brand,is_escluded"


def main() -> None:
    total = 0
    kept = 0
    offset = 0
    t0 = time.time()
    with OUT.open("w", encoding="utf-8") as f:
        while True:
            resp = (
                sb.table("scraped_product")
                .select(SELECT)
                .order("id")
                .range(offset, offset + PAGE - 1)
                .execute()
            )
            batch = resp.data or []
            if not batch:
                break
            for row in batch:
                total += 1
                if row.get("is_escluded"):
                    continue
                norm = (row.get("name_norm") or "").strip()
                if not norm:
                    continue
                f.write(
                    json.dumps(
                        {
                            "id": row["id"],
                            "product_name": row.get("product_name") or "",
                            "name_norm": norm,
                            "brand": row.get("brand"),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                kept += 1
            offset += PAGE
            if total % 5000 == 0 or len(batch) < PAGE:
                print(
                    f"fetched={total} kept={kept} elapsed={time.time()-t0:.1f}s",
                    flush=True,
                )
            if len(batch) < PAGE:
                break
    print(f"DONE kept={kept} -> {OUT} ({time.time()-t0:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
