#!/usr/bin/env python3
"""Patch seo_action/seo_title on product_type_category from seo_shortlist (no re-link)."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
load_dotenv(REPO / ".env.local")
sb = create_client(
    os.environ["NEXT_PUBLIC_SUPABASE_URL"],
    os.environ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
)
RUN = "step1-anti-hairball-2026-07-30"
seo_raw = json.loads((ROOT / "data" / "seo_shortlist.json").read_text(encoding="utf-8"))
seo = {}
for key in ("hub_shortlist", "enrich_priority", "skip"):
    for row in seo_raw.get(key) or []:
        seo[row["mechanical_label"]] = row

# page through categories
offset = 0
updated = 0
while True:
    rows = (
        sb.table("product_type_category")
        .select("id,mechanical_label,is_brand_bucket")
        .eq("run_key", RUN)
        .range(offset, offset + 999)
        .execute()
        .data
        or []
    )
    if not rows:
        break
    for r in rows:
        if r["is_brand_bucket"]:
            patch = {
                "seo_action": "brand",
                "seo_title": "Brand / non tipologico",
                "kind": "brand",
            }
        else:
            s = seo.get(r["mechanical_label"])
            if s:
                patch = {
                    "seo_action": s.get("action") or "enrich",
                    "seo_title": s.get("seo_title"),
                    "kind": s.get("kind") or "unknown",
                    "other": {"seo_reason": s.get("reason")},
                }
            else:
                patch = {"seo_action": "enrich", "kind": "unknown"}
        sb.table("product_type_category").update(patch).eq("id", r["id"]).execute()
        updated += 1
    offset += 1000
    print(f"patched {updated}", flush=True)
print(f"DONE updated={updated}")
