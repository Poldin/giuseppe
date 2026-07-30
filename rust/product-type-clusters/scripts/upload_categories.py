#!/usr/bin/env python3
"""Upload step-1 categories + links. Does NOT modify scraped_product rows."""
from __future__ import annotations

import json
import os
import re
import time
import unicodedata
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REPO = ROOT.parents[1]
load_dotenv(REPO / ".env.local")
load_dotenv(REPO / ".env")

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
if not URL or not KEY:
    raise SystemExit("Missing Supabase env")

sb = create_client(URL, KEY)
RUN_KEY = os.getenv("TYPE_CAT_RUN_KEY", "step1-anti-hairball-2026-07-30")
BATCH = 200


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80] or "cat"


def load_seo_map() -> dict[str, dict]:
    path = DATA / "seo_shortlist.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    m: dict[str, dict] = {}
    for bucket in ("hub_shortlist", "enrich_priority", "skip"):
        for row in raw.get(bucket) or []:
            m[row["mechanical_label"]] = row
        # also from all_by_action if present
    for action, rows in (raw.get("all_by_action") or {}).items():
        for row in rows:
            m[row["mechanical_label"]] = row
    # rebuild from flat lists already done; ensure skip included
    return m


def upsert_categories() -> dict[int, str]:
    """Returns map source_cluster_id -> category uuid."""
    clusters_doc = json.loads((DATA / "step1_clusters.json").read_text(encoding="utf-8"))
    seo = load_seo_map()
    clusters = list(clusters_doc.get("all_clusters") or clusters_doc.get("solid_clusters") or [])
    # Prefer full list if present
    if "all_clusters" not in clusters_doc:
        # reconstruct from solid+medium+small samples is incomplete; use assignments labels later
        # Load unique from assignments if needed
        pass

    # Build from assignments for complete cluster set
    cluster_meta: dict[int, dict] = {}
    for c in clusters_doc.get("solid_clusters", []):
        cluster_meta[int(c["id"])] = c
    for c in clusters_doc.get("medium_clusters", []):
        cluster_meta[int(c["id"])] = c
    for c in clusters_doc.get("small_clusters_sample", []):
        cluster_meta[int(c["id"])] = c
    for c in clusters_doc.get("solid_homogeneous", []) or []:
        cluster_meta[int(c["id"])] = c
    for c in clusters_doc.get("medium_homogeneous", []) or []:
        cluster_meta[int(c["id"])] = c

    # Scan assignments to discover all cluster ids + labels + counts
    counts: dict[int, int] = {}
    labels: dict[int, str] = {}
    assign_path = DATA / "step1_assignments.jsonl"
    with assign_path.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            cid = int(row["cluster_id"])
            counts[cid] = counts.get(cid, 0) + 1
            labels[cid] = str(row["cluster"])

    rows = []
    for cid, label in labels.items():
        meta = cluster_meta.get(cid, {})
        is_brand = cid < 0 or label == "brand"
        seo_row = seo.get(label, {})
        seo_title = seo_row.get("seo_title")
        if is_brand:
            seo_title = seo_title or "Brand / non tipologico"
            kind = "brand"
            action = "brand"
        else:
            seo_title = seo_title or label.replace("_", " ").title()
            kind = seo_row.get("kind") or "unknown"
            action = seo_row.get("action") or "enrich"
        slug = f"{slugify(label)}-{cid}" if not is_brand else f"brand-{RUN_KEY}"
        rows.append(
            {
                "run_key": RUN_KEY,
                "source_cluster_id": cid,
                "slug": slug,
                "mechanical_label": label,
                "seo_title": seo_title,
                "kind": kind,
                "seo_action": action,
                "cohesion": meta.get("cohesion"),
                "size_at_run": counts[cid],
                "is_brand_bucket": is_brand,
                "is_active": True,
                "other": {
                    "top_tokens": meta.get("top_tokens"),
                    "examples": meta.get("examples"),
                    "seo_reason": seo_row.get("reason"),
                },
            }
        )

    # deactivate previous active for this run_key replace strategy: delete links then categories for run
    print(f"Preparing {len(rows)} categories for run_key={RUN_KEY}", flush=True)

    # delete links for run
    while True:
        existing = (
            sb.table("link_scraped_product_type_category")
            .select("id")
            .eq("run_key", RUN_KEY)
            .limit(1000)
            .execute()
            .data
            or []
        )
        if not existing:
            break
        ids = [r["id"] for r in existing]
        sb.table("link_scraped_product_type_category").delete().in_("id", ids).execute()
        print(f"  deleted {len(ids)} old links...", flush=True)

    while True:
        existing = (
            sb.table("product_type_category")
            .select("id")
            .eq("run_key", RUN_KEY)
            .limit(1000)
            .execute()
            .data
            or []
        )
        if not existing:
            break
        ids = [r["id"] for r in existing]
        sb.table("product_type_category").delete().in_("id", ids).execute()
        print(f"  deleted {len(ids)} old categories...", flush=True)

    id_map: dict[int, str] = {}
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        res = sb.table("product_type_category").insert(chunk).execute()
        for r in res.data or []:
            id_map[int(r["source_cluster_id"])] = r["id"]
        print(f"  inserted categories {i+len(chunk)}/{len(rows)}", flush=True)

    return id_map


def upload_links(id_map: dict[int, str]) -> None:
    assign_path = DATA / "step1_assignments.jsonl"
    batch = []
    total = 0
    t0 = time.time()
    with assign_path.open(encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            cid = int(row["cluster_id"])
            cat_id = id_map.get(cid)
            if not cat_id:
                continue
            batch.append(
                {
                    "scraped_product_id": row["id"],
                    "category_id": cat_id,
                    "run_key": RUN_KEY,
                }
            )
            if len(batch) >= BATCH:
                sb.table("link_scraped_product_type_category").insert(batch).execute()
                total += len(batch)
                batch = []
                if total % 2000 == 0:
                    print(f"  links {total} ({time.time()-t0:.1f}s)", flush=True)
    if batch:
        sb.table("link_scraped_product_type_category").insert(batch).execute()
        total += len(batch)
    print(f"DONE links={total} in {time.time()-t0:.1f}s", flush=True)


def main() -> None:
    print(f"Supabase URL={URL} run_key={RUN_KEY}", flush=True)
    id_map = upsert_categories()
    print(f"categories in map: {len(id_map)}", flush=True)
    upload_links(id_map)
    # verify
    cats = (
        sb.table("product_type_category")
        .select("id", count="exact")
        .eq("run_key", RUN_KEY)
        .execute()
    )
    links = (
        sb.table("link_scraped_product_type_category")
        .select("id", count="exact")
        .eq("run_key", RUN_KEY)
        .execute()
    )
    print(
        f"VERIFY categories={cats.count} links={links.count}",
        flush=True,
    )


if __name__ == "__main__":
    main()
