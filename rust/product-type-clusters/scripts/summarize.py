import json
from pathlib import Path

d = json.loads(
    Path(r"c:\Users\hp\giuseppe\rust\product-type-clusters\data\step1_clusters.json").read_text(
        encoding="utf-8"
    )
)
print("SUMMARY", json.dumps(d["summary"], indent=2))
print("PARAMS", d["params"])
print("\nSOLID", len(d["solid_clusters"]))
for c in d["solid_clusters"]:
    print(
        f"{c['size']:5d} {c['pct']:5.2f}% coh={c['cohesion']:.3f} [{c['label']}] :: {c['examples'][0][:70]}"
    )
print("\nMEDIUM", len(d["medium_clusters"]), "(showing 25)")
for c in d["medium_clusters"][:25]:
    print(
        f"{c['size']:5d} coh={c['cohesion']:.3f} [{c['label']}] :: {c['examples'][0][:65]}"
    )
print("\nPROBES")
print(json.dumps(d["probe_stem_stats"], indent=2, ensure_ascii=False))
print("\nBRAND examples")
for e in d["brand"]["examples"][:12]:
    print("-", e)
