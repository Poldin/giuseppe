import json
from pathlib import Path

d = json.loads(
    Path(r"c:\Users\hp\giuseppe\rust\product-type-clusters\data\step1_clusters.json").read_text(
        encoding="utf-8"
    )
)
solid = d["solid_clusters"]
med = d["medium_clusters"]

def show(title, rows):
    print(f"\n{title} ({len(rows)})")
    for c in rows:
        print(
            f"{c['size']:5d} {c['pct']:5.2f}% coh={c['cohesion']:.3f} [{c['label']}] :: {c['examples'][0][:65]}"
        )

show("SOLID size>=25", solid)
show("SOLID size>=25 AND cohesion>=0.25 (mechanical homogeneity)", [c for c in solid if c["cohesion"] >= 0.25])
show("MEDIUM size 8-24 AND cohesion>=0.25", [c for c in med if c["cohesion"] >= 0.25])

print("\nSUMMARY", json.dumps(d["summary"], indent=2))
print("high_coh_solid", sum(1 for c in solid if c["cohesion"] >= 0.25))
print("high_coh_medium", sum(1 for c in med if c["cohesion"] >= 0.25))
print("brand_pct", d["summary"]["brand_pct"])
