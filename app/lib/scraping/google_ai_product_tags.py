"""
SEO B2B dentale via Google AI Mode → archivia su Supabase.

Flusso:
  1) pull scraped_product senza scraped_product_seo_description
  2) Google AI Mode (tag + descrizione + FAQ)
  3) archivia: seo_tag, link_*, scraped_product_seo_faq, scraped_product_seo_description

Esempi:
  # Modalità MANUALE (tu incolli in Google, lo script archivia):
  python -u app/lib/scraping/google_ai_product_tags.py --manual --missing-only --limit 20
  # Modalità umana browser (consigliata se Google mostra captcha):
  #   1) powershell -File app/lib/scraping/start_chrome_human.ps1
  #   2) python app/lib/scraping/google_ai_product_tags.py --missing-only --attach --limit 5
  python app/lib/scraping/google_ai_product_tags.py --missing-only --limit 5
  python app/lib/scraping/google_ai_product_tags.py --pilot
  python app/lib/scraping/google_ai_product_tags.py --missing-only --dry-run --limit 20
  # parallelo efficiente: 1 scan DB → coda locale → N worker claimano 1 prodotto alla volta
  # (sconsigliato se Google rate-limita: preferisci 1 browser --attach)
  python app/lib/scraping/google_ai_product_tags.py --build-queue logs/google_ai_tags/work_queue --limit 150
  python app/lib/scraping/google_ai_product_tags.py --from-queue logs/google_ai_tags/work_queue --limit 15
  # oppure: powershell -File app/lib/scraping/run_google_ai_tags_parallel.ps1 -Workers 10 -Limit 15
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from supabase import Client, create_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parents[3]
load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env")

OUT_DIR = Path(__file__).resolve().parent / "logs" / "google_ai_tags"
PROFILE_DIR = OUT_DIR / "chrome_profile"
# Profilo dedicato per avvio "umano" via CDP (cookie/login persistenti).
HUMAN_PROFILE_DIR = OUT_DIR / "chrome_human_profile"
DEFAULT_CDP_URL = "http://127.0.0.1:9222"

PROMPT_VERSION = "seo_b2b_v5"
PROVIDER = "google_ai_mode"
SCRIPT_NAME = "google_ai_product_tags.py"
PAGE_SIZE = 1000
# Soglia pragmatica: 3 FAQ bastano per archiviare; 4 è il target preferito in attesa
MIN_FAQ_ARCHIVE = 3
MIN_FAQ_WAIT = 4

PILOT_PRODUCTS = [
    "Curasept Treatment 0.20%",
    "Filo Interdentale Oral-B Pro-Expert Premium",
    "Dentifricio Elmix Bimbi 0-6 anni",
    "Spazzolino Elettrico Oral-B iO 6",
    "Scovolini Interdentali GUM Trav-Ler",
]

# Prompt blindato: stesso angolo su ~70k SKU.
# Niente esempi letterali "#[...]" né placeholder tipo "(3-4 frasi)" —
# Google li riecheggia e lo scraper li confonde con contenuto reale.
PROMPT_TEMPLATE = """Ruolo: esperto SEO B2B dental supply + consulente clinico odontoiatrico italiano.
Pubblico: titolari di studio, clinic manager, ASO, igienisti.

PRODOTTO:
{product}

MISSIONE
Genera contenuti strutturati per un catalogo B2B dentale (~70.000 SKU) pensati per entity SEO e citazione in Google AI Overview / AI Mode. Qualità > quantità. Stesso angolo di attacco su ogni prodotto.

VINCOLI ASSOLUTI
- Rispondi SOLO con le tre sezioni sotto. Niente premesse, niente ripetizione di queste istruzioni, niente placeholder, niente testo tipo "scrivi qui".
- NON elencare risultati web, snippet di siti, link o gate "riservato ai professionisti". Genera dal tuo knowledge clinico/commerciale anche se i siti sono chiusi.
- Completa SEMPRE almeno fino a D4/R4. Non fermarti a 3 FAQ. Massimo 5 FAQ.
- Lingua: italiano. Tag in minuscolo con spazi (mai snake_case o kebab-case).
- Primo tag = tipo prodotto canonico ricercabile (obbligatorio), es. spazzolino elettrico / filo interdentale / scovolino interdentale / collutorio / dentifricio pediatrico.
- Poi altri tag solo se matchabili (uso clinico, famiglia, indicazione, principio attivo). Massimo 10 tag totali.
- Vietati tag vaghi: salute dentale, cura dei denti, smart health, dispositivo medico domestico.
- Vietati tag in inglese se esiste equivalente italiano (usa "sistema ads", non "antidiscoloration system").
- Descrizione: 3 o 4 frasi professionali (~400 caratteri max), orientate allo studio dentistico.
- FAQ: domande che ASO/dentista/clinic manager cercano davvero; risposte brevi e citabili; niente FAQ banali.
- Alla fine della risposta scrivi esattamente questa riga: FINE

OUTPUT (copia la struttura, riempi con contenuto reale):

DESCRIZIONE:
<tre o quattro frasi sul prodotto>

TAG:
<una riga: cancelletto + parentesi quadre per ogni tag>

FAQ:
D1: <domanda>
R1: <risposta>
D2: <domanda>
R2: <risposta>
D3: <domanda>
R3: <risposta>
D4: <domanda>
R4: <risposta>
FINE
"""

TAG_RE = re.compile(r"#\[([^\]]+)\]")
TAG_FALLBACK_RE = re.compile(
    r"(?<!\w)#([A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 _/-]{1,60})"
)

TAG_BLOCKLIST = {
    "qui tag di categoria 1",
    "qui tag di categoria 2",
    "qui tag di categoria 3",
    "nome-tag",
    "nome tag",
    "tag",
    "categoria",
}

TAG_GENERIC_BLOCKLIST = {
    "salute dentale",
    "salute-dentale",
    "cura dei denti",
    "cura-dei-denti",
    "cura dentale",
    "smart health",
    "smart-health",
    "dispositivo medico domestico",
    "dispositivo-medico-domestico",
    "igiene domestica",
    "igiene-domestica",
    "dispositivi odontoiatrici",
    "dispositivi-odontoiatrici",
    "antidiscoloration system",
}

DESC_JUNK = {
    "(3-4 frasi)",
    "3-4 frasi",
    "scrivi qui subito le 3-4 frasi sul prodotto",
    "scrivi qui subito la riga dei tag",
    "<tre o quattro frasi sul prodotto>",
    "tre o quattro frasi sul prodotto",
    "<una riga: cancelletto + parentesi quadre per ogni tag>",
}

FAQ_Q_JUNK = {
    "domanda",
    "<domanda>",
    "...",
    "…",
}
FAQ_A_JUNK = {
    "risposta",
    "<risposta>",
    "...",
    "…",
}

STILL_GENERATING_RE = re.compile(
    r"(?i)(sta pensando|thinking|generating|sto generando|"
    r"AI Mode sta pensando|la risposta di AI Mode è in corso|"
    r"rispondendo alla tua query)"
)
DONE_UI_RE = re.compile(
    r"(?i)(la risposta di AI Mode è pronta|response is ready|"
    r"le risposte dell'AI potrebbero contenere errori)"
)

AI_MODE_BASE = "https://www.google.com/search?udm=50&hl=it&gl=it"

# Seed variati per soft-reset sessione (mai la stessa query a loop)
AI_MODE_SEEDS = [
    "odontoiatria",
    "forniture dentali",
    "materiali odontoiatrici studio",
    "consumabili dentista",
    "protesi dentaria materiali",
    "igiene orale professionale",
    "strumentario odontoiatrico",
    "implantologia forniture",
]


def build_prompt(product: str) -> str:
    return PROMPT_TEMPLATE.format(product=product.strip())


def _human_pause(page, lo_ms: float, hi_ms: float) -> None:
    page.wait_for_timeout(int(random.uniform(lo_ms, hi_ms)))


def _human_idle(page, *, kind: str = "short") -> None:
    if kind == "short":
        _human_pause(page, 350, 1600)
    elif kind == "think":
        _human_pause(page, 900, 3800)
    elif kind == "read":
        _human_pause(page, 1600, 5500)
    else:
        _human_pause(page, 400, 1200)


def _maybe_human_scroll(page) -> None:
    if random.random() > 0.4:
        return
    try:
        dy = random.randint(60, 380) * random.choice([-1, 1])
        page.mouse.wheel(0, dy)
        _human_pause(page, 180, 700)
    except Exception:
        pass


def _move_toward_locator(page, loc) -> None:
    """Muove il mouse verso l'input con traiettoria a step (non teleport)."""
    try:
        box = loc.bounding_box(timeout=1500)
        if not box:
            return
        x = box["x"] + box["width"] * random.uniform(0.25, 0.75)
        y = box["y"] + box["height"] * random.uniform(0.3, 0.7)
        page.mouse.move(x, y, steps=random.randint(8, 22))
        _human_pause(page, 80, 320)
    except Exception:
        pass


def _between_product_pause_s(pause_min_s: float, pause_max_s: float) -> float:
    """Pausa irregolare tra SKU: triangular + pause lunghe occasionali."""
    mid = pause_min_s + (pause_max_s - pause_min_s) * 0.62
    base = random.triangular(pause_min_s, pause_max_s, mid)
    roll = random.random()
    if roll < 0.08:
        base += random.uniform(45.0, 120.0)
        print("  pausa lunga (stile umano)…", flush=True)
    elif roll < 0.22:
        base += random.uniform(12.0, 40.0)
    return base


def _clear_input_human(page, box) -> None:
    _move_toward_locator(page, box)
    box.click(timeout=4000)
    _human_pause(page, 120, 450)
    page.keyboard.press("Control+A")
    _human_pause(page, 60, 220)
    page.keyboard.press("Backspace")
    _human_pause(page, 120, 400)


def _paste_or_insert(page, text: str) -> None:
    """Incolla come umano (clipboard+Ctrl+V); fallback insert_text (non fill)."""
    pasted = False
    try:
        ok = page.evaluate(
            """async (t) => {
              try {
                await navigator.clipboard.writeText(t);
                return true;
              } catch (e) {
                return false;
              }
            }""",
            text,
        )
        if ok:
            page.keyboard.press("Control+V")
            pasted = True
    except Exception:
        pasted = False
    if not pasted:
        try:
            page.keyboard.insert_text(text)
        except Exception:
            # ultimo fallback: typing a chunk (mai fill istantaneo)
            for i in range(0, len(text), 24):
                chunk = text[i : i + 24]
                page.keyboard.type(chunk, delay=random.randint(18, 55))
                if random.random() < 0.25:
                    _human_pause(page, 200, 700)


def _type_short_human(page, text: str) -> None:
    """Digitazione lenta per messaggi corti (nudge)."""
    for ch in text:
        page.keyboard.type(ch, delay=random.randint(35, 110))
        if ch in ".!?\n" and random.random() < 0.35:
            _human_pause(page, 180, 650)
        elif ch == " " and random.random() < 0.12:
            _human_pause(page, 90, 320)
        elif random.random() < 0.03:
            _human_pause(page, 250, 900)

def _is_junk_tag(tag: str) -> bool:
    low = tag.casefold().strip()
    if not low or low in TAG_BLOCKLIST or low in TAG_GENERIC_BLOCKLIST:
        return True
    if low.startswith("qui tag") or "tag di categoria" in low:
        return True
    return False


def _normalize_tag(tag: str) -> str:
    t = tag.strip()
    t = t.replace("_", " ").replace("-", " ")
    t = re.sub(r"\s+", " ", t).strip().casefold()
    return t


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out[:10]


def _clean_desc_candidate(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            if lines:
                break
            continue
        if s.upper().startswith(("TAG:", "FAQ:", "D1:", "PRODOTTO", "FINE")):
            break
        if s.startswith("<") and s.endswith(">"):
            continue
        lines.append(s)
    desc = re.sub(r"\s+", " ", " ".join(lines)).strip()
    if not desc or len(desc) < 40:
        return ""
    if desc.casefold() in {j.casefold() for j in DESC_JUNK}:
        return ""
    if desc.startswith("<") or "frasi sul prodotto" in desc.casefold():
        return ""
    return desc[:800]


def parse_tags(text: str) -> list[str]:
    if not text:
        return []

    # Prendi l'ULTIMA sezione TAG: che contenga veri #[...]
    sections = re.findall(r"(?is)\bTAG:\s*(.+?)(?:\n\s*FAQ:|\n\s*FINE\b|\Z)", text)
    candidates = list(sections) if sections else [text]

    best: list[str] = []
    for section in reversed(candidates):
        tags = [_normalize_tag(t) for t in TAG_RE.findall(section) if t.strip()]
        tags = [t for t in tags if not _is_junk_tag(t)]
        if tags:
            best = _dedupe(tags)
            break

    if best:
        return best

    tags = [_normalize_tag(t) for t in TAG_RE.findall(text) if t.strip()]
    tags = [t for t in tags if not _is_junk_tag(t)]
    if tags:
        return _dedupe(tags)

    fallback = []
    for raw in TAG_FALLBACK_RE.findall(text):
        cleaned = _normalize_tag(raw.strip().strip("#[]"))
        if cleaned and not _is_junk_tag(cleaned):
            fallback.append(cleaned)
    return _dedupe(fallback)


def parse_description(text: str) -> str:
    if not text:
        return ""
    # Tutte le occorrenze: scegli la descrizione reale più lunga (salta placeholder)
    blocks = re.findall(
        r"(?is)\bDESCRIZIONE:\s*(.+?)(?:\n\s*TAG:|\n\s*FAQ:|\n\s*FINE\b|\Z)",
        text,
    )
    best = ""
    for block in blocks:
        cand = _clean_desc_candidate(block)
        if len(cand) > len(best):
            best = cand
    if best:
        return best

    # Fallback: paragrafo/i subito prima dell'ultima "TAG:" con hashtag reali
    tag_hits = list(re.finditer(r"(?im)^\s*TAG:\s*.*#\[.+\]", text))
    if not tag_hits:
        # TAG e hashtag sulla stessa area anche senza ^ 
        tag_hits = list(re.finditer(r"(?is)\bTAG:\s*[^\n]*#\[[^\]]+\]", text))
    if tag_hits:
        before = text[: tag_hits[-1].start()].rstrip()
        lines = [ln.strip() for ln in before.splitlines() if ln.strip()]
        buf: list[str] = []
        for ln in reversed(lines):
            if re.match(r"(?i)^(D\d+:|R\d+:|FAQ:|DESCRIZIONE:|TAG:|FINE|VINCOLI|MISSIONE|OUTPUT|PRODOTTO)\b", ln):
                break
            if ln.startswith("<") or ln in DESC_JUNK or ln.casefold() in {j.casefold() for j in DESC_JUNK}:
                break
            if ln.startswith("(") and "frasi" in ln.casefold():
                break
            buf.append(ln)
            if sum(len(x) for x in buf) > 120:
                # abbastanza testo
                joined = " ".join(reversed(buf))
                if len(joined) >= 80:
                    break
        if buf:
            cand = _clean_desc_candidate(" ".join(reversed(buf)))
            if cand and len(cand) >= 80:
                return cand
    return ""


def _is_junk_faq_pair(q: str, a: str) -> bool:
    ql = q.casefold().strip()
    al = a.casefold().strip()
    if ql in FAQ_Q_JUNK or al in FAQ_A_JUNK:
        return True
    if ql.startswith("<") or al.startswith("<"):
        return True
    if len(q) < 12 or len(a) < 20:
        return True
    if q.strip() in (".", "...", "…") or a.strip() in (".", "...", "…"):
        return True
    return False


def parse_faq(text: str) -> list[dict[str, str]]:
    if not text:
        return []

    # Preferisci blocchi FAQ dopo l'ultima TAG con hashtag, altrimenti tutti i FAQ:
    blocks = re.findall(r"(?is)\bFAQ:\s*(.+?)(?=\n\s*FINE\b|\n\s*DESCRIZIONE:|\Z)", text)
    if not blocks:
        blocks = [text]

    best: list[dict[str, str]] = []
    for block in blocks:
        pairs: list[dict[str, str]] = []
        loose = re.findall(
            r"(?is)D\s*(\d+)\s*:\s*(.+?)\s*R\s*\1\s*:\s*(.+?)(?=\s*D\s*\d+\s*:|\s*FINE\b|\Z)",
            block,
        )
        for _, q, a in loose:
            q = re.sub(r"\s+", " ", q).strip()
            a = re.sub(r"\s+", " ", a).strip()
            # taglia coda UI Google
            a = re.split(
                r"(?i)le risposte dell'AI|AI Mode sta|Se desideri ottimizzare",
                a,
                maxsplit=1,
            )[0].strip()
            if _is_junk_faq_pair(q, a):
                continue
            pairs.append({"question": q, "answer": a})
        if len(pairs) >= len(best):
            best = pairs

    return best[:5]


def _has_end_marker(text: str) -> bool:
    return bool(re.search(r"(?m)^\s*FINE\s*$", text)) or "\nFINE\n" in text or text.rstrip().endswith("FINE")


def _still_generating(text: str) -> bool:
    if not text:
        return True
    # Se c'è "sta pensando" verso la fine del testo, la risposta non è chiusa
    tail = text[-1200:]
    if STILL_GENERATING_RE.search(tail):
        return True
    return False


def _looks_like_web_serp_dump(text: str) -> bool:
    """True se AI Mode ha scaricato risultati web invece del formato DESCRIZIONE/TAG/FAQ."""
    if not text:
        return False
    # Se ha già i tag strutturati, non è un dump SERP
    if TAG_RE.search(text) and re.search(r"(?i)\bDESCRIZIONE:", text):
        return False
    low = text.casefold()
    needles = (
        "ecco i principali risultati web",
        "principali risultati web per esplorare",
        "risultati web per esplorare questo argomento",
        "here are the top web results",
        "top web results to explore",
        "contenuto del sito www.",
        "reserved for professionals operating in the health",
        "riservato ai professionisti",
        "dichiaro sotto la mia responsabilità",
    )
    hits = sum(1 for n in needles if n in low)
    if hits >= 1 and not TAG_RE.search(text):
        return True
    # Pattern tipico: ha cercato N siti + card risultato senza TAG
    if re.search(r"(?i)ha cercato\s+\d+\s+sit", text) and not TAG_RE.search(text):
        if "risultat" in low or "www." in low:
            return True
    return False


NUDGE_FORMAT = (
    "Ignora i risultati web e i gate professionali. "
    "NON elencare siti. Genera SUBITO solo questo formato con contenuto reale:\n"
    "DESCRIZIONE:\n...\nTAG:\n#[tipo prodotto] #[altro]\nFAQ:\n"
    "D1: ...\nR1: ...\nD2: ...\nR2: ...\nD3: ...\nR3: ...\nD4: ...\nR4: ...\nFINE"
)


def parse_response(text: str) -> dict:
    working = text or ""
    # Lavora dall'ultima DESCRIZIONE: che non sia solo placeholder
    idxs = [m.start() for m in re.finditer(r"(?i)\bDESCRIZIONE:", working)]
    if idxs:
        # prova dall'ultima all'indietro finché descrizione reale
        chosen = working
        for start in reversed(idxs):
            candidate = working[start:]
            if parse_description(candidate):
                chosen = candidate
                break
            # se ha TAG con #[...] è comunque una risposta
            if TAG_RE.search(candidate):
                chosen = candidate
                break
        working = chosen

    tags = parse_tags(working)
    description = parse_description(working)
    # FAQ sull'intero testo: a volte D4 arriva dopo un secondo blocco
    faq = parse_faq(working)
    if len(faq) < 4:
        faq_all = parse_faq(text or "")
        if len(faq_all) > len(faq):
            faq = faq_all

    return {
        "tags": tags,
        "description": description,
        "faq": faq,
        "has_fine": _has_end_marker(working) or _has_end_marker(text or ""),
        "still_generating": _still_generating(text or ""),
    }


def response_looks_complete(parsed: dict, *, min_faq: int = MIN_FAQ_WAIT) -> bool:
    if parsed.get("still_generating"):
        return False
    tags_ok = bool(parsed.get("tags"))
    desc_ok = bool(parsed.get("description"))
    faq_n = len(parsed.get("faq") or [])
    return tags_ok and desc_ok and faq_n >= min_faq


def dismiss_consent(page) -> None:
    candidates = [
        'button:has-text("Accetta tutto")',
        'button:has-text("Accept all")',
        'button:has-text("Accetto")',
        'button:has-text("I agree")',
        '#L2AGLb',
        'button[aria-label="Accetta tutto"]',
        'button[aria-label="Accept all"]',
    ]
    for sel in candidates:
        try:
            loc = page.locator(sel).first
            if loc.count() and loc.is_visible(timeout=800):
                loc.click(timeout=2000)
                page.wait_for_timeout(800)
                return
        except Exception:
            continue


def _find_chat_input(page):
    selectors = [
        'textarea[aria-label*="Chiedi"]',
        'textarea[aria-label*="Ask"]',
        'textarea[aria-label*="segui"]',
        'textarea[aria-label*="Follow"]',
        'textarea[placeholder*="Chiedi"]',
        'textarea[placeholder*="Ask"]',
        'div[contenteditable="true"][aria-label*="Chiedi"]',
        'div[contenteditable="true"][aria-label*="Ask"]',
        'textarea[name="q"]',
        'textarea',
        'input[name="q"]',
    ]
    for sel in selectors:
        loc = page.locator(sel).last
        try:
            if loc.count() and loc.is_visible(timeout=500):
                return loc
        except Exception:
            continue
    return None


def _extract_page_text(page) -> str:
    selectors = [
        "[data-attrid='wa:/description']",
        "div[data-md]",
        "div.YzCcne",
        "div[role='main']",
        "body",
    ]
    chunks: list[str] = []
    for sel in selectors:
        try:
            loc = page.locator(sel)
            n = min(loc.count(), 8)
            for i in range(n):
                t = loc.nth(i).inner_text(timeout=1500)
                if t and len(t.strip()) > 20:
                    chunks.append(t.strip())
        except Exception:
            continue
    if chunks:
        scored = []
        for c in chunks:
            score = 0
            if "#[" in c:
                score += 3
            if "DESCRIZIONE:" in c.upper():
                score += 2
            if "FAQ:" in c.upper() or re.search(r"\bD1:", c):
                score += 2
            scored.append((score, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        best = [c for s, c in scored if s > 0]
        return "\n\n".join(best or chunks)
    return page.inner_text("body")


def _wait_for_response(page, *, timeout_ms: int = 90000) -> str:
    """Attende la risposta Google; dopo timeout prende il best-effort e va avanti."""
    deadline = time.time() + timeout_ms / 1000
    started = time.time()
    last = ""
    stable = 0
    complete_stable = 0
    best_text = ""
    best_score = -1
    last_heartbeat = 0.0

    while time.time() < deadline:
        elapsed = time.time() - started
        if elapsed - last_heartbeat >= 15:
            last_heartbeat = elapsed
            print(
                f"  …attesa risposta {elapsed:.0f}s "
                f"(best score={best_score}, stable={stable})",
                flush=True,
            )

        text = _extract_page_text(page)
        parsed = parse_response(text)
        faq_n = len(parsed.get("faq") or [])
        score = (
            (4 if parsed.get("tags") else 0)
            + (3 if parsed.get("description") else 0)
            + faq_n * 2
            + (2 if parsed.get("has_fine") else 0)
            - (5 if parsed.get("still_generating") else 0)
        )
        if score > best_score:
            best_score = score
            best_text = text

        generating = bool(parsed.get("still_generating"))
        complete = response_looks_complete(parsed)

        if complete and not generating:
            # Ancora un po': D5 / FINE possono arrivare in coda
            if text == last:
                complete_stable += 1
            else:
                complete_stable = 0
                last = text
            if complete_stable >= 2 or (parsed.get("has_fine") and complete_stable >= 1):
                page.wait_for_timeout(800)
                return _extract_page_text(page)
            page.wait_for_timeout(1200)
            continue

        # AI Mode a volte elenca SERP invece del formato → non aspettare minuti
        if (
            not generating
            and not parsed.get("tags")
            and _looks_like_web_serp_dump(text)
            and (stable >= 3 or elapsed >= 18)
        ):
            print(
                "  …AI Mode ha mostrato risultati web (no TAG) — skip rapido",
                flush=True,
            )
            return best_text or text

        if text == last and len(text) > 120:
            stable += 1
            # Preferisci 4 FAQ; se stabili a lungo, accetta 3 e vai avanti
            if (
                not generating
                and stable >= 4
                and parsed.get("tags")
                and parsed.get("description")
                and faq_n >= MIN_FAQ_WAIT
            ):
                return best_text or text
            if (
                not generating
                and stable >= 6
                and parsed.get("tags")
                and parsed.get("description")
                and faq_n >= MIN_FAQ_ARCHIVE
            ):
                return best_text or text
            # Dopo ~20s di testo fermo con almeno tag: skip avanti (non bloccarsi)
            if not generating and stable >= 8 and parsed.get("tags"):
                return best_text or text
        else:
            stable = 0
            last = text

        page.wait_for_timeout(1200)

    print(
        f"  …timeout attesa ({timeout_ms // 1000}s) — prendo best-effort e vado avanti",
        flush=True,
    )
    return best_text or _extract_page_text(page)


def _open_ai_mode_soft(page, *, headed: bool | None = None) -> None:
    """Apre AI Mode con seed variato (soft reset sessione, non loop URL identico)."""
    del headed  # reserved for future consent/captcha UX
    seed = random.choice(AI_MODE_SEEDS)
    page.goto(
        f"{AI_MODE_BASE}&q={quote_plus(seed)}",
        wait_until="domcontentloaded",
        timeout=60000,
    )
    dismiss_consent(page)
    _human_idle(page, kind="read")
    dismiss_consent(page)
    _maybe_human_scroll(page)


def _submit_prompt(page, prompt: str, *, short: bool = False, allow_navigate: bool = True) -> None:
    """Invio prompt stile umano: mouse → clear → paste/type → pausa → Enter."""
    box = _find_chat_input(page)
    if box is None:
        if allow_navigate:
            _open_ai_mode_soft(page)
            box = _find_chat_input(page)
        else:
            raise RuntimeError(
                "Chat AI Mode non trovata e navigazione disabilitata (--attach)."
            )

    if box is None:
        if not allow_navigate:
            raise RuntimeError(
                "Chat AI Mode non trovata. Apri AI Mode a mano e riprova."
            )
        # fallback estremo: solo se la chat non esiste (tronca)
        page.goto(
            f"{AI_MODE_BASE}&q={quote_plus(prompt[:1200])}",
            wait_until="domcontentloaded",
            timeout=60000,
        )
        dismiss_consent(page)
        return

    _clear_input_human(page, box)
    _human_idle(page, kind="think" if not short else "short")

    if short or len(prompt) < 160:
        _type_short_human(page, prompt)
    else:
        # Template lungo: un umano lo incolla, non lo digita
        _paste_or_insert(page, prompt)

    _human_idle(page, kind="short")
    if random.random() < 0.2:
        _human_pause(page, 400, 1400)
    page.keyboard.press("Enter")
    _human_pause(page, 700, 1800)


def ask_google_ai(
    page,
    product: str,
    *,
    fresh_session: bool = False,
    allow_navigate: bool = True,
) -> dict:
    prompt = build_prompt(product)
    result: dict = {
        "product": product,
        "prompt": prompt,
        "tags": [],
        "description": "",
        "faq": [],
        "raw_excerpt": "",
        "ok": False,
        "error": None,
        "url": None,
    }

    try:
        if fresh_session and allow_navigate:
            _open_ai_mode_soft(page)
        else:
            # Riusa la chat aperta: niente goto per SKU
            if _find_chat_input(page) is None:
                if allow_navigate:
                    _open_ai_mode_soft(page)
                else:
                    raise RuntimeError(
                        "Chat AI Mode sparita. Riapri AI Mode a mano in Chrome e premi Invio al prossimo prompt."
                    )
            else:
                _maybe_human_scroll(page)
                _human_idle(page, kind="think")

        _submit_prompt(page, prompt, allow_navigate=allow_navigate)
        result["url"] = page.url
        text = _wait_for_response(page, timeout_ms=90000)
        parsed = parse_response(text)

        # Un solo nudge se Google ha scaricato SERP invece del formato
        if not parsed["tags"] and _looks_like_web_serp_dump(text):
            print("  nudge: chiedi formato (no risultati web)...", flush=True)
            try:
                _human_idle(page, kind="read")
                _submit_prompt(page, NUDGE_FORMAT, short=True, allow_navigate=allow_navigate)
                text = _wait_for_response(page, timeout_ms=45000)
                parsed = parse_response(text)
            except Exception as nudge_exc:
                print(f"  nudge fallito: {nudge_exc}", flush=True)

        # Estratto intorno alle sezioni utili (ultima occorrenza = risposta, non prompt)
        excerpt = text
        upper = text.upper()
        idx = upper.rfind("DESCRIZIONE:")
        if idx == -1:
            idx = upper.rfind("TAG:")
        if idx != -1:
            excerpt = text[idx : idx + 5000]
        else:
            excerpt = text[-4000:] if len(text) > 4000 else text

        result["tags"] = parsed["tags"]
        result["description"] = parsed["description"]
        result["faq"] = parsed["faq"]
        result["raw_excerpt"] = excerpt
        faq_n = len(parsed["faq"])
        usable = bool(parsed["tags"]) and bool(parsed["description"]) and faq_n >= MIN_FAQ_ARCHIVE
        result["ok"] = usable
        if _looks_like_web_serp_dump(text) and not parsed["tags"]:
            result["error"] = "web_serp_dump — skip"
        elif not parsed["tags"]:
            result["error"] = "Nessun tag trovato nella risposta"
        elif not parsed["description"]:
            result["error"] = "Descrizione mancante o solo placeholder"
        elif faq_n < MIN_FAQ_ARCHIVE:
            result["error"] = f"FAQ insufficienti ({faq_n}/{MIN_FAQ_ARCHIVE}+) — skip"
        elif faq_n < MIN_FAQ_WAIT:
            result["error"] = f"FAQ partial ({faq_n}/{MIN_FAQ_WAIT}) — archivio comunque"
        result["url"] = page.url
        result["has_fine"] = bool(parsed.get("has_fine"))
    except PlaywrightTimeoutError as exc:
        result["error"] = f"timeout: {exc}"
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"

    return result


def _looks_like_bot_wall(text: str) -> bool:
    low = (text or "").casefold()
    return any(
        needle in low
        for needle in (
            "traffico insolito",
            "unusual traffic",
            "non un robot",
            "not a robot",
            "recaptcha",
            "about this page",
        )
    )


def wait_if_bot_wall(page, *, headed: bool, wait_s: int = 180) -> bool:
    """True se la pagina è usabile (no captcha o captcha risolto). False se ancora bloccata."""
    try:
        text = page.inner_text("body", timeout=5000)
    except Exception:
        return True
    if not _looks_like_bot_wall(text):
        return True

    print()
    print("⚠ Google ha mostrato il controllo anti-bot.")
    if headed and sys.stdin.isatty():
        print("Risolvi il captcha nella finestra Chrome, poi premi Invio.")
        try:
            input("> ")
            page.wait_for_timeout(1000)
            try:
                text = page.inner_text("body", timeout=3000)
            except Exception:
                return True
            return not _looks_like_bot_wall(text)
        except EOFError:
            pass

    print(f"Attendo fino a {wait_s}s che il captcha sparisca (poll)...")
    deadline = time.time() + wait_s
    while time.time() < deadline:
        page.wait_for_timeout(5000)
        try:
            text = page.inner_text("body", timeout=3000)
        except Exception:
            continue
        if not _looks_like_bot_wall(text):
            print("Captcha superato.")
            return True
    print("Captcha ancora presente: salto questo prodotto e continuo.")
    return False


def _print_result(row: dict) -> None:
    status = "OK" if row.get("ok") else "PARTIAL/FAIL"
    print(f"  status: {status}" + (f" ({row.get('error')})" if row.get("error") else ""))
    if row.get("tags"):
        print("  tags:", " ".join(f"#[{t}]" for t in row["tags"]))
    if row.get("description"):
        print(
            f"  desc: {row['description'][:220]}"
            f"{'…' if len(row['description']) > 220 else ''}"
        )
    else:
        print("  desc: (mancante)")
    print(
        f"  faq:  {len(row.get('faq') or [])} domande  "
        f"fine_marker={row.get('has_fine')}"
    )
    for i, qa in enumerate(row.get("faq") or [], 1):
        print(f"    D{i}: {qa['question'][:110]}")
    if not row.get("ok") and row.get("raw_excerpt"):
        preview = row["raw_excerpt"].replace("\n", " ")[:220]
        print(f"  excerpt: {preview}")


# ---------------------------------------------------------------------------
# Supabase: pull mancanti + archive
# ---------------------------------------------------------------------------


def get_supabase() -> Client:
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    if not url or not key:
        raise RuntimeError(
            "Mancano NEXT_PUBLIC_SUPABASE_URL e una key "
            "(SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local"
        )
    return create_client(url, key)


def slugify(text: str, max_len: int = 80) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.casefold()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return (text[:max_len].strip("-") or "tag")


def build_other(
    *,
    run_key: str,
    enriched_at: str,
    source_url: str | None,
    has_fine_marker: bool | None,
    model_name: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "provider": PROVIDER,
        "model_name": model_name,
        "prompt_version": PROMPT_VERSION,
        "run_key": run_key,
        "enriched_at": enriched_at,
        "source_url": source_url,
        "has_fine_marker": has_fine_marker,
        "script_name": SCRIPT_NAME,
    }
    if extra:
        payload.update(extra)
    return payload


def fetch_enriched_ids(sb: Client) -> set[str]:
    """Prodotti che hanno già la descrizione Google AI → skip."""
    ids: set[str] = set()
    offset = 0
    while True:
        res = (
            sb.table("scraped_product_seo_description")
            .select("scraped_product_id")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        ids.update(str(r["scraped_product_id"]) for r in rows)
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return ids


def _worker_owns(product_id: str, worker: int, workers: int) -> bool:
    """Partizione stabile per worker paralleli (hash id, non indice → no overlap)."""
    if workers <= 1:
        return True
    digest = hashlib.md5(product_id.encode("utf-8")).hexdigest()
    return int(digest, 16) % workers == worker


def shard_products(
    products: list[dict[str, str]],
    *,
    worker: int,
    workers: int,
) -> list[dict[str, str]]:
    if workers <= 1:
        return products
    return [p for p in products if _worker_owns(p["id"], worker, workers)]


def _queue_dirs(queue_dir: Path) -> dict[str, Path]:
    dirs = {
        "root": queue_dir,
        "pending": queue_dir / "pending",
        "claimed": queue_dir / "claimed",
        "done": queue_dir / "done",
        "failed": queue_dir / "failed",
    }
    for key in ("pending", "claimed", "done", "failed"):
        dirs[key].mkdir(parents=True, exist_ok=True)
    return dirs


def build_work_queue(
    sb: Client,
    queue_dir: Path,
    *,
    limit: int | None,
) -> int:
    """UN solo scan Supabase → file pending/{id}.json. I worker non toccano il catalogo."""
    dirs = _queue_dirs(queue_dir)
    # coda fresca: svuota solo pending (done/failed restano come storico)
    for old in dirs["pending"].glob("*.json"):
        old.unlink(missing_ok=True)

    products = fetch_missing_products(sb, limit=limit, worker=0, workers=1)
    for product in products:
        path = dirs["pending"] / f"{product['id']}.json"
        path.write_text(json.dumps(product, ensure_ascii=False), encoding="utf-8")

    meta = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "count": len(products),
        "limit": limit,
    }
    (queue_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Coda pronta: {len(products)} prodotti in {dirs['pending']}")
    return len(products)


def claim_next_from_queue(
    queue_dir: Path, *, worker_id: str
) -> tuple[dict[str, str], Path] | None:
    """Claim atomico via rename pending → claimed/{worker}/. Nessuna chiamata Supabase."""
    dirs = _queue_dirs(queue_dir)
    worker_claimed = dirs["claimed"] / worker_id
    worker_claimed.mkdir(parents=True, exist_ok=True)

    # poche passate: rename fallisce se un altro worker ha già preso il file
    for _ in range(3):
        try:
            candidates = sorted(dirs["pending"].glob("*.json"))
        except FileNotFoundError:
            return None
        if not candidates:
            return None
        for src in candidates[:40]:  # non scorrere migliaia a vuoto ogni volta
            dest = worker_claimed / src.name
            try:
                os.rename(src, dest)
            except OSError:
                continue
            try:
                product = json.loads(dest.read_text(encoding="utf-8"))
            except Exception:
                dest.rename(dirs["failed"] / dest.name)
                continue
            if not product.get("id") or not product.get("product_name"):
                dest.rename(dirs["failed"] / dest.name)
                continue
            return {
                "id": str(product["id"]),
                "product_name": str(product["product_name"]),
            }, dest
    return None


def finalize_queue_item(
    queue_dir: Path, claimed_path: Path, *, ok: bool
) -> None:
    dirs = _queue_dirs(queue_dir)
    target_dir = dirs["done"] if ok else dirs["failed"]
    dest = target_dir / claimed_path.name
    try:
        if dest.exists():
            dest.unlink()
        claimed_path.rename(dest)
    except OSError as exc:
        print(f"  WARN: finalize queue {claimed_path.name}: {exc}")


def queue_counts(queue_dir: Path) -> dict[str, int]:
    dirs = _queue_dirs(queue_dir)
    return {
        "pending": len(list(dirs["pending"].glob("*.json"))),
        "done": len(list(dirs["done"].glob("*.json"))),
        "failed": len(list(dirs["failed"].glob("*.json"))),
    }


def fetch_missing_products(
    sb: Client,
    *,
    limit: int | None,
    worker: int = 0,
    workers: int = 1,
) -> list[dict[str, str]]:
    """scraped_product eleggibili senza scraped_product_seo_description.

    Ordina per id (PK) — created_at senza indice fa statement timeout su tabelle grandi.
    Attenzione: con workers>1 ogni processo scansiona comunque il catalogo.
    Per il parallelo usare --build-queue / --from-queue (1 scan totale).
    """
    from postgrest.exceptions import APIError

    if workers > 1:
        print(
            "WARN: --workers>1 senza coda locale riscansione il catalogo N volte. "
            "Preferisci --build-queue + --from-queue.",
            flush=True,
        )
    print("Carico id già arricchiti...")
    enriched = fetch_enriched_ids(sb)
    print(f"  già arricchiti: {len(enriched)}")
    if workers > 1:
        print(f"  shard: worker {worker}/{workers} (hash id)")
    if limit is not None:
        print(f"  limite: {limit} prodotti mancanti", flush=True)

    out: list[dict[str, str]] = []
    offset = 0
    page = min(PAGE_SIZE, 500)
    while True:
        rows: list = []
        for attempt in range(1, 4):
            try:
                res = (
                    sb.table("scraped_product")
                    .select("id, product_name, is_escluded")
                    .not_.is_("product_name", "null")
                    .order("id")
                    .range(offset, offset + page - 1)
                    .execute()
                )
                rows = res.data or []
                break
            except APIError as exc:
                msg = str(getattr(exc, "message", None) or exc)
                is_timeout = "57014" in msg or "statement timeout" in msg.lower()
                if not is_timeout or attempt >= 3:
                    raise
                page = max(100, page // 2)
                print(
                    f"  WARN timeout offset={offset} — riprovo page={page} (tentativo {attempt}/3)",
                    flush=True,
                )
                time.sleep(1.5 * attempt)
        if not rows:
            break
        for r in rows:
            if not _is_eligible_scraped_row(r):
                continue
            name = (r.get("product_name") or "").strip()
            pid = str(r["id"])
            if pid in enriched:
                continue
            if not _worker_owns(pid, worker, workers):
                continue
            out.append({"id": pid, "product_name": name})
            if limit is not None and len(out) >= limit:
                return out
        if len(rows) < page:
            break
        offset += page
        if offset % 10000 == 0:
            print(f"  scan scraped_product offset={offset}, missing finora={len(out)}")
    return out


def _escape_ilike(value: str) -> str:
    """Escape wildcard ILIKE (% _) — es. '0.20%' non deve diventare pattern."""
    return value.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


def _is_eligible_scraped_row(row: dict) -> bool:
    if row.get("is_escluded") is True:
        return False
    name = (row.get("product_name") or "").strip()
    return bool(name)


def fetch_products_by_names(
    sb: Client,
    names: list[str],
    *,
    only_missing: bool,
) -> list[dict[str, str]]:
    """Risolve nomi → id DB (match esatto, poi ILIKE con escape)."""
    enriched = fetch_enriched_ids(sb) if only_missing else set()
    out: list[dict[str, str]] = []
    for name in names:
        res = (
            sb.table("scraped_product")
            .select("id, product_name, is_escluded")
            .eq("product_name", name)
            .limit(10)
            .execute()
        )
        rows = [r for r in (res.data or []) if _is_eligible_scraped_row(r)]
        if not rows:
            pattern = f"%{_escape_ilike(name)}%"
            res = (
                sb.table("scraped_product")
                .select("id, product_name, is_escluded")
                .ilike("product_name", pattern)
                .limit(10)
                .execute()
            )
            rows = [r for r in (res.data or []) if _is_eligible_scraped_row(r)]
        if not rows:
            print(f"  WARN: nessun match DB per «{name}»")
            continue
        row = rows[0]
        pid = str(row["id"])
        if only_missing and pid in enriched:
            print(f"  skip (già arricchito): {row['product_name']}")
            continue
        if len(rows) > 1:
            print(
                f"  WARN: {len(rows)} match per «{name}», uso "
                f"{row['product_name']} ({pid})"
            )
        out.append({"id": pid, "product_name": row["product_name"]})
    return out


def ensure_seo_tag(
    sb: Client,
    label: str,
    other: dict[str, Any],
    cache: dict[str, str],
) -> str:
    slug = slugify(label)
    if slug in cache:
        return cache[slug]
    existing = (
        sb.table("seo_tag").select("id").eq("slug", slug).limit(1).execute().data or []
    )
    if existing:
        cache[slug] = str(existing[0]["id"])
        return cache[slug]
    try:
        ins = (
            sb.table("seo_tag")
            .insert({"label": label, "slug": slug, "other": other})
            .execute()
        )
        cache[slug] = str(ins.data[0]["id"])
        return cache[slug]
    except Exception:
        # race / slug già presente
        existing = (
            sb.table("seo_tag").select("id").eq("slug", slug).limit(1).execute().data
            or []
        )
        if not existing:
            raise
        cache[slug] = str(existing[0]["id"])
        return cache[slug]


def archive_result(
    sb: Client,
    *,
    product_id: str,
    result: dict,
    run_key: str,
    tag_cache: dict[str, str],
    store_raw_excerpt: bool,
) -> None:
    """Persiste tag/link/faq/description. Description per ultima (= gate missing)."""
    if not result.get("ok"):
        raise ValueError("archive solo su result ok")

    enriched_at = datetime.now(timezone.utc).isoformat()
    other = build_other(
        run_key=run_key,
        enriched_at=enriched_at,
        source_url=result.get("url"),
        has_fine_marker=bool(result.get("has_fine")),
        extra={"product_name": result.get("product")},
    )
    if store_raw_excerpt and result.get("raw_excerpt"):
        other["raw_excerpt"] = result["raw_excerpt"][:4000]

    tags = result.get("tags") or []
    faq = result.get("faq") or []
    description = (result.get("description") or "").strip()
    if not description or not tags or len(faq) < MIN_FAQ_ARCHIVE:
        raise ValueError("dati incompleti per archive")

    # 1) tags + link (replace link del prodotto)
    sb.table("link_scraped_product_seo_tag").delete().eq(
        "scraped_product_id", product_id
    ).execute()
    link_rows = []
    for pos, label in enumerate(tags, start=1):
        tag_id = ensure_seo_tag(sb, label, other, tag_cache)
        link_rows.append(
            {
                "scraped_product_id": product_id,
                "tag_id": tag_id,
                "position": pos,
                "other": other,
            }
        )
    if link_rows:
        sb.table("link_scraped_product_seo_tag").insert(link_rows).execute()

    # 2) FAQ (replace)
    sb.table("scraped_product_seo_faq").delete().eq(
        "scraped_product_id", product_id
    ).execute()
    faq_rows = [
        {
            "scraped_product_id": product_id,
            "position": i,
            "question": qa["question"],
            "answer": qa["answer"],
            "other": other,
        }
        for i, qa in enumerate(faq, start=1)
    ]
    if faq_rows:
        sb.table("scraped_product_seo_faq").insert(faq_rows).execute()

    # 3) descrizione per ultima → prodotto esce dai "mancanti" solo se tutto ok
    sb.table("scraped_product_seo_description").upsert(
        {
            "scraped_product_id": product_id,
            "description": description,
            "other": other,
            "updated_at": enriched_at,
        },
        on_conflict="scraped_product_id",
    ).execute()


def _read_pasted_response() -> str | None:
    """Legge risposta multi-riga da stdin fino a una riga END / SKIP / QUIT."""
    print()
    print("-" * 60)
    print("Incolla la risposta di Google AI Mode qui sotto.")
    print("Poi una riga da sola con:  END   (archivia) | SKIP | QUIT")
    print("-" * 60)
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        cmd = line.strip().casefold()
        if cmd in {"end", "<<<end", "/end"}:
            break
        if cmd in {"skip", "s"}:
            return None
        if cmd in {"quit", "q", "exit"}:
            raise KeyboardInterrupt
        lines.append(line)
    return "\n".join(lines).strip()


def _result_from_manual_text(product_name: str, text: str) -> dict:
    parsed = parse_response(text)
    faq_n = len(parsed.get("faq") or [])
    usable = (
        bool(parsed.get("tags"))
        and bool(parsed.get("description"))
        and faq_n >= MIN_FAQ_ARCHIVE
    )
    result: dict = {
        "product": product_name,
        "prompt": None,
        "tags": parsed.get("tags") or [],
        "description": parsed.get("description") or "",
        "faq": parsed.get("faq") or [],
        "raw_excerpt": text[:5000],
        "ok": usable,
        "error": None,
        "url": None,
        "has_fine": bool(parsed.get("has_fine")),
    }
    if _looks_like_bot_wall(text):
        result["ok"] = False
        result["error"] = "captcha_blocked — risposta non valida"
    elif _looks_like_web_serp_dump(text) and not parsed.get("tags"):
        result["ok"] = False
        result["error"] = "web_serp_dump — skip"
    elif not parsed.get("tags"):
        result["ok"] = False
        result["error"] = "Nessun tag trovato nella risposta"
    elif not parsed.get("description"):
        result["ok"] = False
        result["error"] = "Descrizione mancante o solo placeholder"
    elif faq_n < MIN_FAQ_ARCHIVE:
        result["ok"] = False
        result["error"] = f"FAQ insufficienti ({faq_n}/{MIN_FAQ_ARCHIVE}+) — skip"
    elif faq_n < MIN_FAQ_WAIT:
        result["error"] = f"FAQ partial ({faq_n}/{MIN_FAQ_WAIT}) — archivio comunque"
    return result


def run_manual(
    products: list[dict[str, str]] | None,
    *,
    dry_run: bool,
    archive: bool,
    store_raw_excerpt: bool,
    queue_dir: Path | None = None,
    queue_worker_id: str = "0",
    max_claims: int | None = None,
) -> dict:
    """Tu incolli in Google a mano; lo script stampa prompt, legge risposta, archivia."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_key = f"{stamp}_{PROVIDER}_{PROMPT_VERSION}_manual"
    out_path = OUT_DIR / f"run_{stamp}_manual.json"
    if queue_dir is not None:
        out_path = OUT_DIR / f"run_{stamp}_manual_w{queue_worker_id}.json"

    sb: Client | None = None
    if archive and not dry_run:
        sb = get_supabase()

    tag_cache: dict[str, str] = {}
    results: list[dict] = []
    archived = 0
    failed = 0
    skipped = 0
    preloaded = products is not None
    total_hint = (
        len(products)
        if preloaded
        else (max_claims if max_claims is not None else "?")
    )

    print()
    print("=" * 60)
    print("MODALITÀ MANUALE — niente browser")
    print("Per ogni prodotto: copi il prompt → Google AI Mode → incolli qui → END")
    print("Comandi: END = salva | SKIP = salta | QUIT = esci")
    print("=" * 60)

    try:
        i = 0
        while True:
            if preloaded:
                if i >= len(products or []):
                    break
                product = (products or [])[i]
                claimed_path: Path | None = None
            else:
                if max_claims is not None and i >= max_claims:
                    break
                assert queue_dir is not None
                claimed = claim_next_from_queue(queue_dir, worker_id=queue_worker_id)
                if claimed is None:
                    print("Coda vuota: fine.")
                    break
                product, claimed_path = claimed

            pid = product["id"]
            name = product["product_name"]
            prompt = build_prompt(name)

            print()
            print(f"[{i + 1}/{total_hint}] {name}")
            print(f"  id: {pid}")
            print()
            print("=" * 20 + " COPIA IL PROMPT " + "=" * 20)
            print(prompt)
            print("=" * 56)

            try:
                text = _read_pasted_response()
            except KeyboardInterrupt:
                print("\nUscita (QUIT).")
                break

            if text is None:
                skipped += 1
                print("  skipped.")
                if claimed_path is not None and queue_dir is not None:
                    # rimetti in pending? meglio failed/skip: failed
                    finalize_queue_item(queue_dir, claimed_path, ok=False)
                i += 1
                continue

            if not text:
                print("  risposta vuota — riprova lo stesso prodotto.")
                continue

            row = _result_from_manual_text(name, text)
            row_out = {
                **row,
                "scraped_product_id": pid,
                "archived": False,
            }
            _print_result(row)

            archived_ok = False
            if row.get("ok") and archive and not dry_run and sb is not None:
                try:
                    archive_result(
                        sb,
                        product_id=pid,
                        result=row,
                        run_key=run_key,
                        tag_cache=tag_cache,
                        store_raw_excerpt=store_raw_excerpt,
                    )
                    row_out["archived"] = True
                    archived_ok = True
                    archived += 1
                    print("  archived: OK")
                except Exception as exc:
                    failed += 1
                    row_out["archive_error"] = f"{type(exc).__name__}: {exc}"
                    print(f"  archived: FAIL — {row_out['archive_error']}")
            elif row.get("ok") and dry_run:
                archived_ok = True
                print("  archived: skipped (--dry-run)")
            elif row.get("ok") and not archive:
                archived_ok = True
                print("  archived: skipped (--no-archive)")
            else:
                failed += 1
                print("  non archiviato (risposta incompleta). Riprova? Incolla di nuovo o SKIP.")
                # lascia riprovare lo stesso prodotto se preloaded: non incrementare
                # ma se incompleta, chiedi se riprovare
                retry = input("  [r]iprova / [s]kip / [q]uit > ").strip().casefold()
                if retry.startswith("r"):
                    continue
                if retry.startswith("q"):
                    break
                skipped += 1

            if claimed_path is not None and queue_dir is not None:
                finalize_queue_item(
                    queue_dir, claimed_path, ok=archived_ok or bool(row.get("ok"))
                )

            results.append(row_out)
            i += 1
    except KeyboardInterrupt:
        print("\nInterrotto.")

    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_key": run_key,
        "mode": "manual_paste",
        "prompt_version": PROMPT_VERSION,
        "provider": PROVIDER,
        "product_count": len(results),
        "ok_count": sum(1 for r in results if r.get("ok")),
        "archived_count": archived,
        "failed_count": failed,
        "skipped_count": skipped,
        "dry_run": dry_run,
        "results": results,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"Log: {out_path}")
    print(
        f"OK {payload['ok_count']}/{payload['product_count']} | "
        f"archived {archived} | failed {failed} | skipped {skipped}"
    )
    return payload


def _launch_persistent_context(p, *, headed: bool, slow_mo: int, use_chrome: bool):
    """Apre Chrome con profilo sticky; fallback su profilo run solo se lockato."""
    stamp_local = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    # Sticky first: cookie/history/login restano → meno "bot" di un profilo vuoto a ogni restart.
    profile_candidates = [
        PROFILE_DIR,
        OUT_DIR / f"chrome_profile_run_{stamp_local}",
    ]
    last_err: Exception | None = None
    for profile in profile_candidates:
        profile.mkdir(parents=True, exist_ok=True)
        launch_kwargs: dict = {
            "user_data_dir": str(profile),
            "locale": "it-IT",
            "viewport": {"width": 1400, "height": 900},
            "headless": not headed,
            "slow_mo": slow_mo,
            "ignore_default_args": ["--enable-automation"],
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
            ],
        }
        if use_chrome:
            launch_kwargs["channel"] = "chrome"
        try:
            context = p.chromium.launch_persistent_context(**launch_kwargs)
            print(f"Browser profile: {profile}")
            return context
        except Exception as exc:
            last_err = exc
            print(f"WARN: launch fallito su {profile.name}: {exc}")
            continue
    raise RuntimeError(f"Impossibile avviare Chrome: {last_err}")


def _attach_existing_chrome(p, *, cdp_url: str):
    """Si aggancia a un Chrome già aperto (nessun flag Playwright → fingerprint umano)."""
    try:
        browser = p.chromium.connect_over_cdp(cdp_url)
    except Exception as exc:
        raise RuntimeError(
            f"Impossibile connettersi a Chrome su {cdp_url}.\n"
            f"Apri prima Chrome in modalità debug, es.:\n"
            f'  powershell -File app/lib/scraping/start_chrome_human.ps1\n'
            f"Errore: {exc}"
        ) from exc
    if not browser.contexts:
        raise RuntimeError(
            f"Connesso a {cdp_url} ma nessun browser context. "
            "Apri almeno una tab in Chrome e riprova."
        )
    context = browser.contexts[0]
    page = context.pages[0] if context.pages else context.new_page()
    print(f"Browser attach CDP: {cdp_url} | tabs={len(context.pages)}")
    return browser, context, page


def _page_has_ai_chat(page) -> bool:
    try:
        url = (page.url or "").casefold()
        if "udm=50" in url or "/search" in url:
            if _find_chat_input(page) is not None:
                return True
        return _find_chat_input(page) is not None
    except Exception:
        return False


def _pick_ai_mode_page(context, fallback_page):
    """Preferisci una tab già su AI Mode / con chat, senza navigare."""
    pages = list(getattr(context, "pages", []) or [])
    for p in pages:
        if _page_has_ai_chat(p):
            return p
    for p in pages:
        try:
            if "google." in (p.url or "").casefold() and "sorry" not in (p.url or "").casefold():
                return p
        except Exception:
            continue
    return fallback_page


def _wait_for_manual_ai_mode(page, context, *, headed: bool):
    """In attach: NESSUN goto automatico. L'utente apre AI Mode a mano."""
    page = _pick_ai_mode_page(context, page)
    if _page_has_ai_chat(page):
        print("AI Mode già aperta — parto dalla chat esistente (no goto).")
        if not wait_if_bot_wall(page, headed=headed, wait_s=30):
            raise RuntimeError(
                "Captcha presente. Risolvilo a mano nella tab Chrome, poi rilancia con --attach."
            )
        return page

    print()
    print("=" * 60)
    print("ATTACH: non navigo io (evita captcha automatico).")
    print("Nella finestra Chrome (il TUO profilo):")
    print("  1) Apri google.com e vai in AI Mode (o cerca qualcosa di normale)")
    print("  2) Se compare captcha, risolvilo TU")
    print("  3) Assicurati che la casella chat AI Mode sia visibile")
    print("  4) Torna qui e premi Invio")
    print("=" * 60)
    if headed and sys.stdin.isatty():
        try:
            input("> pronto, Invio per continuare… ")
        except EOFError:
            pass
    else:
        print("Attendo fino a 3 minuti che appaia la chat AI Mode…")
        deadline = time.time() + 180
        while time.time() < deadline:
            page = _pick_ai_mode_page(context, page)
            if _page_has_ai_chat(page) and wait_if_bot_wall(page, headed=False, wait_s=5):
                return page
            time.sleep(3)

    page = _pick_ai_mode_page(context, page)
    if not _page_has_ai_chat(page):
        raise RuntimeError(
            "Chat AI Mode non trovata. Apri AI Mode a mano in Chrome e rilancia con --attach."
        )
    if not wait_if_bot_wall(page, headed=headed, wait_s=60):
        raise RuntimeError(
            "Captcha ancora presente. Risolvilo a mano, poi rilancia."
        )
    print("OK: chat AI Mode pronta.")
    return page


def _warmup_ai_mode(page, *, headed: bool) -> None:
    """Apre AI Mode e gestisce consent/captcha al warm-up (solo launch Playwright)."""
    _open_ai_mode_soft(page, headed=headed)
    if not wait_if_bot_wall(page, headed=headed):
        print("Captcha al warm-up: attendo ancora 60s poi riprovo…")
        page.wait_for_timeout(60000)
        if not wait_if_bot_wall(page, headed=headed, wait_s=60):
            raise RuntimeError(
                "Captcha al warm-up non risolto. Rilancia lo script e risolvi il captcha a mano."
            )


def _open_browser_window(
    p,
    *,
    headed: bool,
    slow_mo: int,
    use_chrome: bool,
    cdp_url: str | None = None,
):
    """Apre/attacca Chrome. In attach: zero navigazione automatica."""
    browser = None
    if cdp_url:
        browser, context, page = _attach_existing_chrome(p, cdp_url=cdp_url)
        page = _wait_for_manual_ai_mode(page, context, headed=headed)
    else:
        context = _launch_persistent_context(
            p, headed=headed, slow_mo=slow_mo, use_chrome=use_chrome
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        _warmup_ai_mode(page, headed=headed)
    return browser, context, page


def _close_browser_quiet(context, *, attached: bool) -> None:
    """In attach CDP non chiudiamo il Chrome dell'utente: solo le tab di lavoro."""
    if attached:
        return
    try:
        context.close()
    except Exception as exc:
        print(f"  WARN: close browser: {exc}")


def _soft_reset_attached_page(context, page):
    """Dopo captcha in modalità attach: nuova tab invece di rilanciare Chrome."""
    try:
        new_page = context.new_page()
        try:
            page.close()
        except Exception:
            pass
        return new_page
    except Exception as exc:
        print(f"  WARN: nuova tab fallita, riuso pagina corrente: {exc}")
        return page


def run(
    products: list[dict[str, str]] | None,
    *,
    headed: bool,
    slow_mo: int,
    pause_min_s: float,
    pause_max_s: float,
    use_chrome: bool,
    dry_run: bool,
    archive: bool,
    store_raw_excerpt: bool,
    browser_restart_every: int = 0,
    chat_reset_every: int = 12,
    queue_dir: Path | None = None,
    queue_worker_id: str = "0",
    max_claims: int | None = None,
    cdp_url: str | None = None,
) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    run_key = f"{stamp}_{PROVIDER}_{PROMPT_VERSION}"
    out_path = OUT_DIR / f"run_{stamp}.json"
    if queue_dir is not None:
        out_path = OUT_DIR / f"run_{stamp}_w{queue_worker_id}.json"

    sb: Client | None = None
    if archive and not dry_run:
        sb = get_supabase()

    tag_cache: dict[str, str] = {}
    results: list[dict] = []
    archived = 0
    failed = 0
    since_restart = 0
    since_chat_reset = 0
    force_restart = False
    force_chat_reset = False
    attached = cdp_url is not None
    preloaded = products is not None
    total_hint = (
        len(products)
        if preloaded
        else (max_claims if max_claims is not None else "?")
    )

    with sync_playwright() as p:
        if attached:
            print(f"Browser mode: attach CDP ({cdp_url}) — Chrome umano, no relaunch")
        else:
            print(
                f"Browser restart: nuova finestra ogni {browser_restart_every} richieste"
                if browser_restart_every > 0
                else "Browser restart: disattivato"
            )
        print(
            f"Chat reuse: soft-reset ogni {chat_reset_every} SKU (niente goto per prodotto)"
            if chat_reset_every > 0
            else "Chat reuse: soft-reset disattivato (solo riuso continuo)"
        )
        if queue_dir is not None:
            print(
                f"Coda locale: {queue_dir} | claim 1-alla-volta | "
                f"worker={queue_worker_id} | max_claims={max_claims or '∞'}"
            )
        _browser, context, page = _open_browser_window(
            p,
            headed=headed,
            slow_mo=slow_mo,
            use_chrome=use_chrome,
            cdp_url=cdp_url,
        )
        try:
            context.grant_permissions(
                ["clipboard-read", "clipboard-write"],
                origin="https://www.google.com",
            )
        except Exception as exc:
            print(f"WARN: clipboard permission: {exc}")

        try:
            i = 0
            while True:
                if preloaded:
                    if i >= len(products or []):
                        break
                    product = (products or [])[i]
                    claimed_path: Path | None = None
                else:
                    if max_claims is not None and i >= max_claims:
                        break
                    assert queue_dir is not None
                    claimed = claim_next_from_queue(
                        queue_dir, worker_id=queue_worker_id
                    )
                    if claimed is None:
                        print("Coda vuota: fine worker.")
                        break
                    product, claimed_path = claimed

                # Hard relaunch solo senza CDP e solo se richiesto
                if force_restart or (
                    not attached
                    and browser_restart_every > 0
                    and since_restart >= browser_restart_every
                    and i > 0
                ):
                    if attached:
                        print()
                        print("↻ Soft-reset tab (attach CDP, captcha/bot)…")
                        print(
                            "Apri AI Mode a mano nella nuova tab, risolvi captcha se c'è, poi Invio."
                        )
                        page = _soft_reset_attached_page(context, page)
                        page = _wait_for_manual_ai_mode(page, context, headed=headed)
                        force_chat_reset = False
                        since_chat_reset = 0
                    else:
                        why = (
                            "captcha/bot"
                            if force_restart
                            else f"ogni {browser_restart_every}"
                        )
                        print()
                        print(f"↻ Riavvio browser (nuova finestra, {why})…")
                        _close_browser_quiet(context, attached=False)
                        time.sleep(random.uniform(3.0, 8.0))
                        _browser, context, page = _open_browser_window(
                            p,
                            headed=headed,
                            slow_mo=slow_mo,
                            use_chrome=use_chrome,
                            cdp_url=None,
                        )
                        try:
                            context.grant_permissions(
                                ["clipboard-read", "clipboard-write"],
                                origin="https://www.google.com",
                            )
                        except Exception:
                            pass
                        since_chat_reset = 0
                    since_restart = 0
                    force_restart = False

                # Soft reset chat: in attach NESSUN goto — chiedi all'utente
                elif force_chat_reset or (
                    chat_reset_every > 0
                    and since_chat_reset >= chat_reset_every
                    and i > 0
                ):
                    print()
                    if attached:
                        print(
                            "↻ Soft-reset chat (attach): apri UNA nuova ricerca AI Mode "
                            "a mano in Chrome, risolvi captcha se serve, poi Invio."
                        )
                        page = _wait_for_manual_ai_mode(page, context, headed=headed)
                    else:
                        print(
                            f"↻ Soft-reset chat AI Mode "
                            f"({'captcha/serp' if force_chat_reset else f'ogni {chat_reset_every}'})…"
                        )
                        _human_idle(page, kind="read")
                        _open_ai_mode_soft(page, headed=headed)
                        if not wait_if_bot_wall(page, headed=headed, wait_s=90):
                            force_restart = True
                            continue
                    since_chat_reset = 0
                    force_chat_reset = False

                pid = product["id"]
                name = product["product_name"]
                print()
                print(f"[{i + 1}/{total_hint}] {name}")
                print(f"  id: {pid}")

                try:
                    # Dopo warm-up: riusa sempre la chat (niente goto per SKU)
                    row = ask_google_ai(
                        page,
                        name,
                        fresh_session=False,
                        allow_navigate=not attached,
                    )
                    if row.get("raw_excerpt") and _looks_like_bot_wall(row["raw_excerpt"]):
                        if wait_if_bot_wall(page, headed=headed, wait_s=60):
                            row = ask_google_ai(
                                page,
                                name,
                                fresh_session=False,
                                allow_navigate=not attached,
                            )
                        else:
                            row = {
                                "product": name,
                                "ok": False,
                                "error": "captcha_blocked — skip",
                                "tags": [],
                                "description": "",
                                "faq": [],
                                "raw_excerpt": row.get("raw_excerpt"),
                                "has_fine": False,
                                "url": row.get("url"),
                            }
                            force_restart = True
                    elif row.get("error") == "web_serp_dump — skip":
                        force_chat_reset = True
                except Exception as exc:
                    err = f"{type(exc).__name__}: {exc}"
                    row = {
                        "product": name,
                        "ok": False,
                        "error": err,
                        "tags": [],
                        "description": "",
                        "faq": [],
                        "raw_excerpt": "",
                        "has_fine": False,
                        "url": None,
                    }
                    # browser morto / target closed → nuova finestra subito
                    if any(
                        x in err.casefold()
                        for x in ("has been closed", "target closed", "browser has been")
                    ):
                        force_restart = True

                row_out = {
                    **row,
                    "prompt": None,
                    "scraped_product_id": pid,
                    "archived": False,
                }
                _print_result(row)

                archived_ok = False
                if row.get("ok") and archive and not dry_run and sb is not None:
                    try:
                        archive_result(
                            sb,
                            product_id=pid,
                            result=row,
                            run_key=run_key,
                            tag_cache=tag_cache,
                            store_raw_excerpt=store_raw_excerpt,
                        )
                        row_out["archived"] = True
                        archived_ok = True
                        archived += 1
                        print("  archived: OK")
                    except Exception as exc:
                        failed += 1
                        row_out["archive_error"] = f"{type(exc).__name__}: {exc}"
                        print(f"  archived: FAIL — {row_out['archive_error']}")
                elif row.get("ok") and dry_run:
                    archived_ok = True
                    print("  archived: skipped (--dry-run)")
                elif row.get("ok") and not archive:
                    archived_ok = True
                    print("  archived: skipped (--no-archive)")
                else:
                    failed += 1

                if claimed_path is not None and queue_dir is not None:
                    finalize_queue_item(
                        queue_dir, claimed_path, ok=archived_ok or bool(row.get("ok"))
                    )

                results.append(row_out)
                since_restart += 1
                since_chat_reset += 1
                i += 1

                # checkpoint ogni 10
                if i % 10 == 0:
                    checkpoint = OUT_DIR / f"run_{stamp}_checkpoint.json"
                    if queue_dir is not None:
                        checkpoint = OUT_DIR / f"run_{stamp}_w{queue_worker_id}_checkpoint.json"
                    payload_cp = {
                        "run_key": run_key,
                        "done": i,
                        "archived": archived,
                        "failed": failed,
                    }
                    if queue_dir is not None:
                        payload_cp["queue"] = queue_counts(queue_dir)
                    checkpoint.write_text(
                        json.dumps(payload_cp, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    print(f"  checkpoint: {checkpoint.name} ({archived} archived)")

                # se coda: non sappiamo se ci sono altri; pausa solo se probabilmente sì
                more_expected = (
                    (i < len(products or []))
                    if preloaded
                    else (max_claims is None or i < max_claims)
                )
                if more_expected and not force_restart and not force_chat_reset:
                    # in coda: se pending=0 salta pausa lunga (prossimo claim uscirà)
                    if queue_dir is not None and queue_counts(queue_dir)["pending"] == 0:
                        continue
                    pause_s = _between_product_pause_s(pause_min_s, pause_max_s)
                    print(f"  attesa {pause_s:.1f}s prima della prossima ricerca...")
                    time.sleep(pause_s)
                elif (force_restart or force_chat_reset) and more_expected:
                    print("  skip pausa: reset sessione immediato…")
                    time.sleep(random.uniform(1.5, 4.0))
        finally:
            _close_browser_quiet(context, attached=attached)

    payload = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_key": run_key,
        "mode": "google_ai_mode_seo_b2b",
        "prompt_version": PROMPT_VERSION,
        "provider": PROVIDER,
        "product_count": len(results),
        "ok_count": sum(1 for r in results if r.get("ok")),
        "archived_count": archived,
        "failed_count": failed,
        "dry_run": dry_run,
        "queue_dir": str(queue_dir) if queue_dir else None,
        "results": results,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"Log: {out_path}")
    print(
        f"OK Google {payload['ok_count']}/{payload['product_count']} | "
        f"archived {archived} | failed {failed}"
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Pull scraped_product mancanti → Google AI Mode → "
            "archivia seo_tag / link / faq / description"
        )
    )
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Solo prodotti senza scraped_product_seo_description (default se non --pilot/--product)",
    )
    parser.add_argument(
        "--pilot",
        action="store_true",
        help="Usa la lista pilot e risolve gli id su scraped_product",
    )
    parser.add_argument(
        "--product",
        action="append",
        dest="products",
        help="Nome prodotto (ripetibile). Risolto su DB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max prodotti da processare (consigliato nei test)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Esegue Google AI ma non scrive su Supabase",
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Come dry-run ma esplicito: non archivia",
    )
    parser.add_argument(
        "--store-raw-excerpt",
        action="store_true",
        help="Salva raw_excerpt troncato in other (default: no)",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        default=True,
        help="Browser visibile (default: sì)",
    )
    parser.add_argument("--headless", action="store_true", help="Forza headless")
    parser.add_argument("--slow-mo", type=int, default=50, help="Playwright slow_mo ms")
    parser.add_argument(
        "--pause-min",
        type=float,
        default=12.0,
        help="Pausa minima tra SKU (s). Default 12",
    )
    parser.add_argument(
        "--pause-max",
        type=float,
        default=35.0,
        help="Pausa massima tra SKU (s). Default 35 (+ pause lunghe occasionali)",
    )
    parser.add_argument(
        "--chromium",
        action="store_true",
        help="Usa Chromium Playwright invece di Chrome di sistema",
    )
    parser.add_argument(
        "--browser-restart-every",
        type=int,
        default=0,
        help="Hard relaunch Chrome ogni N richieste (0=mai). Default: 0. Ignorato con --attach",
    )
    parser.add_argument(
        "--chat-reset-every",
        type=int,
        default=12,
        help="Soft-reset AI Mode (nuovo seed) ogni N SKU senza chiudere Chrome. Default: 12",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help=(
            "Niente browser: stampa il prompt, tu lo incolli in Google AI Mode, "
            "incolli la risposta nel terminale (END), archivia e passa al prossimo"
        ),
    )
    parser.add_argument(
        "--attach",
        action="store_true",
        help=(
            "Modalità umana: si aggancia a Chrome già aperto via CDP "
            "(avvia prima start_chrome_human.ps1). Evita flag Playwright/bot."
        ),
    )
    parser.add_argument(
        "--cdp-url",
        type=str,
        default=DEFAULT_CDP_URL,
        help=f"URL CDP per --attach (default: {DEFAULT_CDP_URL})",
    )
    parser.add_argument(
        "--worker",
        type=int,
        default=0,
        help="Indice worker 0-based (solo legacy hash-shard o id claim coda)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Legacy: partizione hash (sconsigliato). Preferisci --build-queue/--from-queue",
    )
    parser.add_argument(
        "--build-queue",
        type=str,
        default=None,
        metavar="DIR",
        help="UN solo scan Supabase → scrive coda locale in DIR, poi esce",
    )
    parser.add_argument(
        "--from-queue",
        type=str,
        default=None,
        metavar="DIR",
        help="Claim 1 prodotto alla volta dalla coda locale (niente rescan catalogo)",
    )
    args = parser.parse_args()

    headed = not args.headless
    pause_min = min(args.pause_min, args.pause_max)
    pause_max = max(args.pause_min, args.pause_max)
    archive = not args.dry_run and not args.no_archive
    workers = max(1, args.workers)
    worker = args.worker % workers

    sb = get_supabase()

    if args.build_queue:
        queue_dir = Path(args.build_queue)
        if not queue_dir.is_absolute():
            queue_dir = (ROOT_DIR / queue_dir).resolve()
        n = build_work_queue(sb, queue_dir, limit=args.limit)
        print(f"Build coda OK: {n} item → {queue_dir}")
        return

    if args.from_queue:
        queue_dir = Path(args.from_queue)
        if not queue_dir.is_absolute():
            queue_dir = (ROOT_DIR / queue_dir).resolve()
        if not (queue_dir / "pending").exists():
            raise SystemExit(f"Coda non trovata: {queue_dir} (manca pending/)")
        counts = queue_counts(queue_dir)
        print(
            f"Da coda {queue_dir} | pending={counts['pending']} "
            f"done={counts['done']} failed={counts['failed']} | "
            f"worker={worker} | max_claims={args.limit or '∞'} | "
            f"archive={archive} | prompt={PROMPT_VERSION}"
        )
        if counts["pending"] == 0:
            print("Nessun prodotto in pending.")
            return
        if args.manual:
            run_manual(
                None,
                dry_run=args.dry_run,
                archive=archive,
                store_raw_excerpt=args.store_raw_excerpt,
                queue_dir=queue_dir,
                queue_worker_id=str(worker),
                max_claims=args.limit,
            )
            return
        run(
            None,
            headed=headed,
            slow_mo=args.slow_mo,
            pause_min_s=pause_min,
            pause_max_s=pause_max,
            use_chrome=not args.chromium,
            dry_run=args.dry_run,
            browser_restart_every=max(0, args.browser_restart_every),
            chat_reset_every=max(0, args.chat_reset_every),
            archive=archive,
            store_raw_excerpt=args.store_raw_excerpt,
            queue_dir=queue_dir,
            queue_worker_id=str(worker),
            max_claims=args.limit,
            cdp_url=args.cdp_url if args.attach else None,
        )
        return

    if args.pilot or args.products:
        names = args.products or PILOT_PRODUCTS
        # pilot/missing-only → salta già arricchiti; --product senza flag → forza anche se presenti
        only_missing = True if args.pilot or args.missing_only else False
        if args.products and args.missing_only:
            only_missing = True
        if args.products and not args.missing_only and not args.pilot:
            only_missing = False
        products = fetch_products_by_names(sb, names, only_missing=only_missing)
        products = shard_products(products, worker=worker, workers=workers)
        if args.limit is not None:
            products = products[: args.limit]
    else:
        # default: missing-only su catalogo (singolo processo)
        products = fetch_missing_products(
            sb, limit=args.limit, worker=worker, workers=workers
        )

    if not products:
        print("Nessun prodotto da processare.")
        return

    if args.manual:
        print(
            f"MANUALE | prodotti: {len(products)} | archive={archive} | "
            f"dry_run={args.dry_run} | prompt={PROMPT_VERSION}"
        )
        run_manual(
            products,
            dry_run=args.dry_run,
            archive=archive,
            store_raw_excerpt=args.store_raw_excerpt,
        )
        return

    print(
        f"Prodotti in coda: {len(products)} | worker={worker}/{workers} | "
        f"archive={archive} | dry_run={args.dry_run} | prompt={PROMPT_VERSION} | "
        f"browser_restart_every={args.browser_restart_every} | "
        f"chat_reset_every={args.chat_reset_every}"
        + (" | attach=CDP" if args.attach else "")
    )
    run(
        products,
        headed=headed,
        slow_mo=args.slow_mo,
        pause_min_s=pause_min,
        pause_max_s=pause_max,
        use_chrome=not args.chromium,
        dry_run=args.dry_run,
        browser_restart_every=max(0, args.browser_restart_every),
        chat_reset_every=max(0, args.chat_reset_every),
        archive=archive,
        store_raw_excerpt=args.store_raw_excerpt,
        cdp_url=args.cdp_url if args.attach else None,
    )


if __name__ == "__main__":
    main()
