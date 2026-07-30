"""SEO shortlist from homogeneous solid clusters (step-2 external filter)."""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "step1_clusters.json"
OUT = Path(__file__).resolve().parents[1] / "data" / "seo_shortlist.json"
OUT_MD = Path(__file__).resolve().parents[1] / "data" / "seo_shortlist.md"

# mechanical_label -> (seo_title_it, kind)
# kind: type | brand_line | type_or_line | type_weak | attr | sku | weak | unknown
RELABEL: dict[str, tuple[str, str]] = {
    "physioset": ("Denti Physioset", "brand_line"),
    "ivostar": ("Denti Ivoclar (SR / Ivoclar)", "brand_line"),
    "preference": ("Denti Preference", "brand_line"),
    "physiostar": ("Denti Physiostar", "brand_line"),
    "physioselect": ("Denti PhysioSelect", "brand_line"),
    "bonartic": ("Denti Bonartic", "brand_line"),
    "bonselect": ("Denti Bonselect", "brand_line"),
    "condyloform": ("Denti Condyloform", "brand_line"),
    "superlux": ("Denti Major Superlux", "brand_line"),
    "dent": ("Denti Major Dent", "brand_line"),
    "wfa": ("Denti Major Plus WFA", "brand_line"),
    "premium": ("Denti Premium", "type_or_line"),
    "vivodent": ("Denti SR Vivodent", "brand_line"),
    "mondial": ("Denti Mondial", "brand_line"),
    "vitapan": ("Denti Vitapan", "brand_line"),
    "phonares": ("Denti Phonares", "brand_line"),
    "gnathostar": ("Denti Gnathostar", "brand_line"),
    "idealis": ("Denti Idealis", "brand_line"),
    "dcl": ("Denti Orthotyp S DCL", "brand_line"),
    "denti": ("Denti artificiali", "type"),
    "diatorici": ("Denti diatorici", "type"),
    "inferiori": ("Incisivi inferiori protesi", "type"),
    "anteriori": ("Denti anteriori protesi", "type"),
    "manica": ("Camici monouso dentali", "type"),
    "pantalone": ("Pantaloni / divise cliniche", "type"),
    "frese": ("Frese dentali", "type"),
    "fresa": ("Frese dentali", "type"),
    "grana": ("Frese diamantate", "type"),
    "tungsteno": ("Frese al tungsteno", "type"),
    "carburo": ("Frese in carburo di tungsteno", "type"),
    "fresone": ("Fresoni da laboratorio", "type"),
    "edenta": ("Frese Edenta", "brand_line"),
    "busch": ("Frese Busch", "brand_line"),
    "shorties": ("Frese Busch Shorties", "brand_line"),
    "monosteryl": ("Frese monouso Monosteryl", "brand_line"),
    "rfid": ("Frese Roto RFID", "brand_line"),
    "polic": ("Corone in policarbonato", "type"),
    "tempra": ("Bande di tempra ortodontiche", "type"),
    "archi": ("Archi ortodontici", "type"),
    "conv": ("Tubi molari / Velocity", "type_or_line"),
    "coni": ("Coni carta / gutta endodonzia", "type"),
    "punte": ("Punte endodontiche", "type"),
    "guttaperca": ("Guttaperca endodonzia", "type"),
    "hedstroem": ("Lime Hedstroem", "type"),
    "reamers": ("Reamers endodontici", "type"),
    "mani": ("Lime K-Files Mani", "brand_line"),
    "maillefer": ("Strumenti endo Maillefer", "brand_line"),
    "proshaper": ("ProShaper endodonzia", "brand_line"),
    "profile": ("Profile endodonzia", "brand_line"),
    "thermafil": ("Thermafil endodonzia", "brand_line"),
    "reci": ("One Reci endodonzia", "brand_line"),
    "katana": ("Blank / dischi Katana", "brand_line"),
    "stml": ("Katana STML", "brand_line"),
    "yml": ("Katana YML", "brand_line"),
    "zircomast": ("Dischi Zircomast", "brand_line"),
    "blank": ("Blank zirconia CAD-CAM", "type"),
    "mill": ("Dischi zirconia CAD-CAM", "type"),
    "vertys": ("Dischi Vertys CAD", "brand_line"),
    "upcera": ("Dischi Upcera", "brand_line"),
    "crios": ("Brilliant Crios", "brand_line"),
    "orodent": ("Dischi Orodent", "brand_line"),
    "arcata": ("Brilliant Componeer", "brand_line"),
    "herculite": ("Composito Herculite", "brand_line"),
    "dialog": ("Materiali Dialog", "brand_line"),
    "flow": ("Compositi flow", "type"),
    "composite": ("Compositi", "type"),
    "compule": ("Compule composito", "type"),
    "siringa": ("Siringhe materiali restaurativi", "type_weak"),
    "ips": ("IPS Ivoclar ceramica / CAD", "brand_line"),
    "max": ("IPS Empress CAD", "brand_line"),
    "ivotion": ("Ivoclar Ivotion", "brand_line"),
    "akzent": ("Akzent Plus", "brand_line"),
    "variolink": ("Variolink cementazione", "brand_line"),
    "surtex": ("Perni Surtex", "brand_line"),
    "vicryl": ("Suture Vicryl", "brand_line"),
    "lex": ("Dischi Sof-Lex", "brand_line"),
    "hysolate": ("Uncini / diga Hysolate", "brand_line"),
    "buste": ("Buste di sterilizzazione", "type"),
    "lame": ("Lame per bisturi", "type"),
    "escavatore": ("Escavatori dentali", "type"),
    "pinza": ("Pinze dentali", "type"),
    "matrici": ("Matrici dentali", "type"),
    "inox": ("Portaimpronte inox", "type"),
    "collutorio": ("Collutori dentali", "type"),
    "disinfettante": ("Disinfettanti clinici", "type"),
    "vassoio": ("Vassoi clinici", "type"),
    "aghi": ("Aghi per irrigazione", "type"),
    "sinistro": ("Bande tempra (lato)", "attr"),
    "destro": ("Bande tempra (lato)", "attr"),
    "a012d": ("K-Files Maillefer (SKU)", "sku"),
    "a011d": ("K-Reamers Maillefer (SKU)", "sku"),
    "a016d": ("Hedstroem Maillefer (SKU)", "sku"),
    "a32": ("Major Superlux codice forma", "sku"),
    "bl2": ("Physioset colore", "sku"),
    "comp": ("Accessori generici", "weak"),
    "intensiv": ("Lucidatura Eve/Intensiv", "weak"),
    "diam": ("Accessori diametro", "weak"),
}

TYPE_HUBS = {
    "frese", "fresa", "grana", "manica", "polic", "tempra", "archi", "coni", "punte",
    "hedstroem", "reamers", "tungsteno", "carburo", "buste", "lame", "escavatore",
    "pinza", "matrici", "guttaperca", "collutorio", "pantalone", "inox", "blank",
    "mill", "aghi", "vassoio", "disinfettante", "composite", "flow", "denti",
    "anteriori", "inferiori", "diatorici", "fresone", "compule",
}


def classify(lab: str, n: int, coh: float, kind: str) -> tuple[str, str]:
    if kind in ("sku", "attr", "weak"):
        return "skip", "codice / attributo / label debole"
    if kind == "type_weak" or lab == "siringa":
        return ("enrich", "tipo ampio: related su pub/vs") if n >= 200 else ("skip", "troppo ambiguo")

    if lab in TYPE_HUBS and n >= 50 and coh >= 0.25:
        return "hub", "tipo tipologico + volume"
    if lab in TYPE_HUBS and n >= 25:
        return "enrich", "tipo ok, lander borderline"

    if kind == "brand_line":
        if n >= 200 and coh >= 0.45:
            return "hub", "linea brand densa"
        if n >= 60:
            return "enrich", "related/filtro; hub solo con demand brand"
        return "enrich", "linea piccola: related"

    if kind in ("type", "type_or_line") and n >= 40 and coh >= 0.3:
        return "hub", "tipo / linea tipologica"
    if n >= 100 and coh >= 0.35:
        return "enrich", "volume: arricchimento"
    return "enrich", "candidato related"


def main() -> None:
    d = json.loads(DATA.read_text(encoding="utf-8"))
    solids = d.get("solid_homogeneous") or [
        c for c in d["solid_clusters"] if c["cohesion"] >= 0.25
    ]

    by_label: dict[str, dict] = {}
    for c in solids:
        lab = c["label"]
        if lab not in by_label:
            by_label[lab] = {
                "label": lab,
                "size": c["size"],
                "cohesion_max": c["cohesion"],
                "n_sub": 1,
                "examples": list(c["examples"][:3]),
            }
        else:
            by_label[lab]["size"] += c["size"]
            by_label[lab]["cohesion_max"] = max(by_label[lab]["cohesion_max"], c["cohesion"])
            by_label[lab]["n_sub"] += 1
            for ex in c["examples"][:2]:
                if ex not in by_label[lab]["examples"] and len(by_label[lab]["examples"]) < 4:
                    by_label[lab]["examples"].append(ex)

    # Merge fresa+frese+grana into one hub candidate row? Keep separate but note alias in title.
    rows = []
    for lab, agg in by_label.items():
        pub, kind = RELABEL.get(lab, (lab.replace("_", " ").title(), "unknown"))
        action, reason = classify(lab, agg["size"], agg["cohesion_max"], kind)
        rows.append(
            {
                "mechanical_label": lab,
                "seo_title": pub,
                "kind": kind,
                "records": agg["size"],
                "cohesion_max": round(agg["cohesion_max"], 3),
                "subclusters": agg["n_sub"],
                "action": action,
                "reason": reason,
                "examples": agg["examples"][:3],
            }
        )

    hubs = sorted([r for r in rows if r["action"] == "hub"], key=lambda r: -r["records"])
    enrich = sorted([r for r in rows if r["action"] == "enrich"], key=lambda r: -r["records"])
    skip = sorted([r for r in rows if r["action"] == "skip"], key=lambda r: -r["records"])

    # Deduplicate hub intents: keep best of fresa/frese (same SEO title family)
    seen_titles: set[str] = set()
    hubs_dedup = []
    for r in hubs:
        key = r["seo_title"].lower()
        # normalize frese variants
        if "frese dentali" in key or key.startswith("frese"):
            key = "frese dentali"
        if key in seen_titles:
            # fold records note into enrich of duplicate
            r = {**r, "action": "enrich", "reason": "alias di hub già in shortlist"}
            enrich.append(r)
            continue
        seen_titles.add(key)
        hubs_dedup.append(r)
    enrich = sorted(enrich, key=lambda r: -r["records"])

    out = {
        "homogeneous_clusters_input": len(solids),
        "unique_labels": len(rows),
        "counts": {"hub": len(hubs_dedup), "enrich": len(enrich), "skip": len(skip)},
        "hub_shortlist": hubs_dedup[:40],
        "enrich_priority": enrich[:30],
        "skip": skip,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    md = [
        "# SEO shortlist — cluster omogenei step-1",
        "",
        f"Input: **{len(solids)}** cluster omogenei → **{len(rows)}** label uniche.",
        f"Classificazione: hub **{len(hubs_dedup)}** · enrich **{len(enrich)}** · skip **{len(skip)}**.",
        "",
        "## Hub (lander dedicate candidate)",
        "",
        "| # | Title SEO | n | coh | label | perché |",
        "|---|---|---:|---:|---|---|",
    ]
    for i, r in enumerate(hubs_dedup[:40], 1):
        md.append(
            f"| {i} | {r['seo_title']} | {r['records']} | {r['cohesion_max']} | `{r['mechanical_label']}` | {r['reason']} |"
        )
    md += [
        "",
        "## Enrich prioritari (`/pub` `/vs`)",
        "",
        "| Title | n | label | perché |",
        "|---|---:|---|---|",
    ]
    for r in enrich[:25]:
        md.append(
            f"| {r['seo_title']} | {r['records']} | `{r['mechanical_label']}` | {r['reason']} |"
        )
    md += ["", "## Skip", ""]
    for r in skip[:20]:
        md.append(f"- `{r['mechanical_label']}` (n={r['records']}): {r['reason']}")

    OUT_MD.write_text("\n".join(md), encoding="utf-8")
    print(json.dumps(out["counts"], indent=2))
    print("--- HUB ---")
    for r in hubs_dedup[:25]:
        print(f"{r['records']:4d}  {r['seo_title']}  [{r['mechanical_label']}]")
    print(f"wrote {OUT_MD}")


if __name__ == "__main__":
    main()
