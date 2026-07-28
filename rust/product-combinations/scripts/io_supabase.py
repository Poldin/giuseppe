#!/usr/bin/env python3
"""Dump scraped_product + upsert product_combinations (no truncate).

- Upsert per slug con is_active=true
- Ricostruisce link_combinations_scraped_products per le combo toccate
- A fine run: is_active=false sulle slug non presenti in questo batch
- backfill-redirects: other.redirect_to dalle 1v1 inactive → cluster

Usage:
  python scripts/io_supabase.py dump
  python scripts/io_supabase.py upload
  python scripts/io_supabase.py backfill-redirects
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
    raise SystemExit(
        "Mancano NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    )

sb = create_client(URL, KEY)

PAGE = 1000
UPLOAD_BATCH = 200
DEACTIVATE_BATCH = 200


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


def fetch_all_slugs() -> list[str]:
    slugs: list[str] = []
    offset = 0
    while True:
        resp = (
            sb.table("product_combinations")
            .select("slug")
            .order("slug")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            if row.get("slug"):
                slugs.append(str(row["slug"]))
        offset += len(rows)
        if len(rows) < PAGE:
            break
    return slugs


def replace_links(combination_id: str, product_ids: list[str]) -> int:
    # Delete existing links for this combination, then insert.
    while True:
        resp = (
            sb.table("link_combinations_scraped_products")
            .delete()
            .eq("combination_id", combination_id)
            .execute()
        )
        n = len(resp.data or [])
        if n == 0:
            break
    if not product_ids:
        return 0
    link_rows = [
        {"combination_id": combination_id, "scraped_product_id": pid}
        for pid in product_ids
    ]
    sb.table("link_combinations_scraped_products").insert(link_rows).execute()
    return len(link_rows)


def deactivate_missing(active_slugs: set[str]) -> int:
    existing = fetch_all_slugs()
    to_deactivate = [s for s in existing if s not in active_slugs]
    print(f"Deactivating {len(to_deactivate)} stale combinations…", flush=True)
    done = 0
    for i in range(0, len(to_deactivate), DEACTIVATE_BATCH):
        chunk = to_deactivate[i : i + DEACTIVATE_BATCH]
        sb.table("product_combinations").update({"is_active": False}).in_(
            "slug", chunk
        ).execute()
        done += len(chunk)
        print(f"  deactivated {done}/{len(to_deactivate)}", flush=True)
    return done


def _extract_products(other: dict) -> list[dict]:
    products = other.get("products")
    if isinstance(products, list) and products:
        return [p for p in products if isinstance(p, dict)]
    out: list[dict] = []
    for key in ("product_a", "product_b"):
        p = other.get(key)
        if isinstance(p, dict):
            out.append(p)
    return out


def _fetch_rows(*, active: bool | None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = (
            sb.table("product_combinations")
            .select("id,slug,other,is_active")
            .order("slug")
            .range(offset, offset + PAGE - 1)
        )
        if active is True:
            q = q.eq("is_active", True)
        elif active is False:
            q = q.eq("is_active", False)
        resp = q.execute()
        batch = resp.data or []
        if not batch:
            break
        rows.extend(batch)
        offset += len(batch)
        if len(batch) < PAGE:
            break
    return rows


def backfill_redirects() -> None:
    """Dump → match locale → upsert other.redirect_to in batch.

    Matching: entrambi gli ecommerce della 1v1 devono essere nel cluster;
    a parità vince più product-id in comune, poi score cluster.
    """
    t0 = time.time()
    print("Dump product_combinations (active+inactive)…", flush=True)
    active_rows = _fetch_rows(active=True)
    inactive_rows = _fetch_rows(active=False)
    print(
        f"  active={len(active_rows)} inactive={len(inactive_rows)} "
        f"({time.time() - t0:.1f}s)",
        flush=True,
    )

    clusters: list[dict] = []
    for row in active_rows:
        other = row.get("other") or {}
        if not isinstance(other, dict):
            continue
        if other.get("kind") == "pair":
            continue
        products = _extract_products(other)
        pids = {str(p["id"]) for p in products if p.get("id")}
        eids = {str(p["ecommerce_id"]) for p in products if p.get("ecommerce_id")}
        if len(eids) < 2:
            continue
        clusters.append(
            {
                "slug": str(row["slug"]),
                "pids": pids,
                "eids": eids,
                "score": float(other.get("score") or 0),
            }
        )

    by_eid: dict[str, list[int]] = {}
    for i, c in enumerate(clusters):
        for eid in c["eids"]:
            by_eid.setdefault(eid, []).append(i)
    print(f"  clusters usable: {len(clusters)}", flush=True)

    print("Matching redirects in-memory…", flush=True)
    updates: list[dict] = []
    skipped = 0
    unchanged = 0

    for row in inactive_rows:
        other = row.get("other") or {}
        if not isinstance(other, dict):
            skipped += 1
            continue
        products = _extract_products(other)
        pids = {str(p["id"]) for p in products if p.get("id")}
        eids = {str(p["ecommerce_id"]) for p in products if p.get("ecommerce_id")}
        if len(eids) < 2:
            skipped += 1
            continue

        candidate_idxs: set[int] | None = None
        for eid in eids:
            idxs = set(by_eid.get(eid, []))
            candidate_idxs = idxs if candidate_idxs is None else (candidate_idxs & idxs)
            if not candidate_idxs:
                break
        if not candidate_idxs:
            skipped += 1
            continue

        best = None
        best_key = None
        for idx in candidate_idxs:
            c = clusters[idx]
            if not eids.issubset(c["eids"]):
                continue
            overlap = len(pids & c["pids"])
            key = (overlap, c["score"], -len(c["eids"]))
            if best_key is None or key > best_key:
                best_key = key
                best = c

        if not best:
            skipped += 1
            continue

        target = best["slug"]
        if other.get("redirect_to") == target:
            unchanged += 1
            continue

        updates.append(
            {
                "id": row["id"],
                "slug": row["slug"],
                "is_active": False,
                "other": {**other, "redirect_to": target},
            }
        )

    print(
        f"  to_upload={len(updates)} unchanged={unchanged} skipped={skipped}",
        flush=True,
    )

    uploaded = 0
    for i in range(0, len(updates), UPLOAD_BATCH):
        chunk = updates[i : i + UPLOAD_BATCH]
        sb.table("product_combinations").upsert(
            chunk, on_conflict="id"
        ).execute()
        uploaded += len(chunk)
        print(f"  upserted {uploaded}/{len(updates)}", flush=True)

    print(
        f"OK redirects: uploaded={uploaded} unchanged={unchanged} "
        f"skipped={skipped} ({time.time() - t0:.1f}s)"
    )


def upload_combinations() -> None:
    if not COMBOS_PATH.exists():
        raise SystemExit(f"Manca {COMBOS_PATH}: esegui prima il binary Rust")

    combos: list[dict] = []
    with COMBOS_PATH.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            combos.append(json.loads(line))

    print(f"Upserting {len(combos)} combinations…", flush=True)
    t0 = time.time()
    active_slugs: set[str] = set()
    links_total = 0

    for i in range(0, len(combos), UPLOAD_BATCH):
        chunk = combos[i : i + UPLOAD_BATCH]
        combo_rows = [
            {"slug": c["slug"], "other": c["other"], "is_active": True}
            for c in chunk
        ]
        upserted = (
            sb.table("product_combinations")
            .upsert(combo_rows, on_conflict="slug")
            .execute()
            .data
            or []
        )
        if len(upserted) != len(chunk):
            # Alcuni client non restituiscono tutte le righe: ricarica per slug.
            slugs = [c["slug"] for c in chunk]
            upserted = (
                sb.table("product_combinations")
                .select("id,slug")
                .in_("slug", slugs)
                .execute()
                .data
                or []
            )
        by_slug = {str(r["slug"]): str(r["id"]) for r in upserted if r.get("slug")}
        if len(by_slug) != len(chunk):
            missing = [c["slug"] for c in chunk if c["slug"] not in by_slug]
            raise SystemExit(
                f"Upsert mismatch: sent {len(chunk)} got {len(by_slug)}; "
                f"missing eg {missing[:3]}"
            )

        for src in chunk:
            cid = by_slug[src["slug"]]
            product_ids = src.get("product_ids") or []
            if not product_ids:
                # compat: vecchio formato a/b
                a = src.get("product_a_id")
                b = src.get("product_b_id")
                product_ids = [x for x in (a, b) if x]
            links_total += replace_links(cid, product_ids)
            active_slugs.add(src["slug"])

        print(
            f"  {min(i + UPLOAD_BATCH, len(combos))}/{len(combos)} combos, "
            f"{links_total} links refreshed",
            flush=True,
        )

    deactivated = deactivate_missing(active_slugs)
    print(
        f"OK upload {len(combos)} active, {links_total} links, "
        f"{deactivated} deactivated ({time.time() - t0:.1f}s)"
    )
    backfill_redirects()


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"dump", "upload", "backfill-redirects"}:
        print(__doc__)
        raise SystemExit(2)
    cmd = sys.argv[1]
    if cmd == "dump":
        dump_products()
    elif cmd == "backfill-redirects":
        backfill_redirects()
    else:
        upload_combinations()


if __name__ == "__main__":
    main()
