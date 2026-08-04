"""
UI manuale Google AI tags — tabella 100/pagina.

  1) Chiudi tutte le finestre Chrome, poi:
       powershell -File app/lib/scraping/start_chrome_human.ps1 -UseMyChrome
  2) Da C:\\Users\\hp\\giuseppe:
       python -u app/lib/scraping/google_ai_tags_manual_ui.py
  3) Apri http://127.0.0.1:8765 in Chrome

Click "Apri Google AI" → finestra a metà destra dello schermo con il prompt.
Copia la risposta → Ctrl+V nella col. 2 (auto-salva dopo 3s). Verde = in DB.

Carica i primi N mancanti (default 200, env GOOGLE_AI_UI_LIMIT).
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote_plus, urlparse

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.lib.scraping import google_ai_product_tags as g  # noqa: E402

HOST = "127.0.0.1"
PORT = 8765
PAGE_SIZE = 100
# Quanti prodotti mancanti caricare in UI (non tutto il catalogo — evita timeout).
UI_FETCH_LIMIT = int(os.environ.get("GOOGLE_AI_UI_LIMIT", "200"))
CDP_URL = os.environ.get("GOOGLE_AI_CDP_URL", g.DEFAULT_CDP_URL)
WATCH_FIND_TIMEOUT_S = 25.0
WATCH_INITIAL_WAIT_S = 5.0
WATCH_RESPONSE_TIMEOUT_MS = 90000
WATCH_CAPTCHA_EXTRA_S = 120.0

_state_lock = threading.Lock()
_cdp_lock = threading.Lock()
_products: list[dict[str, str]] = []
_done: dict[str, dict[str, Any]] = {}  # id -> {ok, error, archived_at, tags_n, faq_n}
_loading = True
_load_error: str | None = None
_run_key = ""
_tag_cache: dict[str, str] = {}
_sb = None
_pw = None
_browser = None


def _load_products() -> None:
    global _products, _loading, _load_error, _run_key, _sb
    try:
        _sb = g.get_supabase()
        _run_key = (
            datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            + f"_{g.PROVIDER}_{g.PROMPT_VERSION}_ui"
        )
        print(
            f"Carico fino a {UI_FETCH_LIMIT} prodotti mancanti da Supabase…",
            flush=True,
        )
        products = g.fetch_missing_products(
            _sb, limit=UI_FETCH_LIMIT, worker=0, workers=1
        )
        with _state_lock:
            _products = products
            _loading = False
            _load_error = None
        print(
            f"Pronti: {len(products)} prodotti in coda UI "
            f"(limite {UI_FETCH_LIMIT}). UI su http://{HOST}:{PORT}",
            flush=True,
        )
    except Exception as exc:
        with _state_lock:
            _loading = False
            _load_error = f"{type(exc).__name__}: {exc}"
        traceback.print_exc()


def _page_slice(page: int, size: int) -> tuple[list[dict], int, int]:
    with _state_lock:
        total = len(_products)
        start = max(0, page) * size
        chunk = _products[start : start + size]
        done_snapshot = dict(_done)
    rows = []
    for p in chunk:
        pid = p["id"]
        done = done_snapshot.get(pid)
        rows.append(
            {
                "id": pid,
                "product_name": p["product_name"],
                "prompt": g.build_prompt(p["product_name"]),
                "done": bool(done and done.get("ok")),
                "error": (done or {}).get("error"),
                "tags_n": (done or {}).get("tags_n"),
                "faq_n": (done or {}).get("faq_n"),
            }
        )
    pages = max(1, (total + size - 1) // size) if total else 1
    return rows, total, pages


def _save_one(product_id: str, text: str) -> dict[str, Any]:
    with _state_lock:
        product = next((p for p in _products if p["id"] == product_id), None)
        sb = _sb
        run_key = _run_key
    if product is None:
        return {"ok": False, "error": "prodotto non in coda"}
    if not (text or "").strip():
        return {"ok": False, "error": "risposta vuota"}

    result = g._result_from_manual_text(product["product_name"], text.strip())
    if not result.get("ok"):
        info = {
            "ok": False,
            "error": result.get("error") or "parse fallito",
            "tags_n": len(result.get("tags") or []),
            "faq_n": len(result.get("faq") or []),
        }
        with _state_lock:
            _done[product_id] = info
        return info

    assert sb is not None
    try:
        g.archive_result(
            sb,
            product_id=product_id,
            result=result,
            run_key=run_key,
            tag_cache=_tag_cache,
            store_raw_excerpt=False,
        )
    except Exception as exc:
        info = {
            "ok": False,
            "error": f"archive: {type(exc).__name__}: {exc}",
            "tags_n": len(result.get("tags") or []),
            "faq_n": len(result.get("faq") or []),
        }
        with _state_lock:
            _done[product_id] = info
        return info

    info = {
        "ok": True,
        "error": None,
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "tags_n": len(result.get("tags") or []),
        "faq_n": len(result.get("faq") or []),
        "description": (result.get("description") or "")[:160],
    }
    with _state_lock:
        _done[product_id] = info
    return info


def _probe_cdp() -> bool:
    try:
        with urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=1.5) as resp:
            return getattr(resp, "status", 200) == 200
    except Exception:
        return False


def _ensure_browser():
    """Connessione CDP condivisa (un solo thread alla volta via _cdp_lock)."""
    global _pw, _browser
    from playwright.sync_api import sync_playwright

    if _browser is not None:
        try:
            if _browser.is_connected():
                return _browser
        except Exception:
            pass
        _browser = None
    if _pw is not None:
        try:
            _pw.stop()
        except Exception:
            pass
        _pw = None
    _pw = sync_playwright().start()
    _browser = _pw.chromium.connect_over_cdp(CDP_URL)
    return _browser


def _iter_pages(browser):
    for ctx in browser.contexts:
        for page in list(ctx.pages):
            yield page


def _find_watch_page(browser, *, product_id: str, known_urls: set[str]):
    marker = f"giu={product_id[:8]}"
    # 1) match esplicito marker
    for page in _iter_pages(browser):
        try:
            url = page.url or ""
        except Exception:
            continue
        if marker in url and ("udm=50" in url or "google." in url):
            return page
    # 2) nuova pagina AI Mode non vista prima
    for page in _iter_pages(browser):
        try:
            url = page.url or ""
        except Exception:
            continue
        if url in known_urls:
            continue
        if "udm=50" in url and "google." in url:
            return page
    return None


def _watch_and_archive(product_id: str) -> dict[str, Any]:
    """Apre Google AI via CDP (finestra/tab), attende risposta, archivia, chiude."""
    from urllib.parse import quote

    print(f"WATCH start id={product_id[:8]}…", flush=True)
    with _state_lock:
        product = next((p for p in _products if p["id"] == product_id), None)
    if product is None:
        print(f"WATCH {product_id[:8]} FAIL: non in coda", flush=True)
        return {"ok": False, "error": "prodotto non in coda"}

    prompt = g.build_prompt(product["product_name"])
    url = (
        f"{g.AI_MODE_BASE}&q={quote(prompt, safe='')}"
        f"&giu={quote(product_id[:8], safe='')}"
    )
    text = ""
    page = None

    with _cdp_lock:
        try:
            browser = _ensure_browser()
            print(f"WATCH {product_id[:8]} CDP connesso", flush=True)
        except Exception as exc:
            err = (
                f"CDP non raggiungibile ({CDP_URL}): {exc}. "
                "Avvia Chrome con start_chrome_human.ps1 -UseMyChrome."
            )
            print(f"WATCH {product_id[:8]} FAIL: {err}", flush=True)
            return {"ok": False, "error": err, "cdp": False}

        if not browser.contexts:
            err = "Nessun context Chrome via CDP — apri almeno una tab in Chrome debug."
            print(f"WATCH {product_id[:8]} FAIL: {err}", flush=True)
            return {"ok": False, "error": err, "cdp": True}

        context = browser.contexts[0]
        try:
            # Prova nuova finestra via CDP; fallback: nuova tab
            page = None
            try:
                cdp = browser.new_browser_cdp_session()
                created = cdp.send(
                    "Target.createTarget",
                    {
                        "url": "about:blank",
                        "newWindow": True,
                        "width": 1200,
                        "height": 900,
                    },
                )
                target_id = created.get("targetId")
                print(f"WATCH {product_id[:8]} createTarget={target_id}", flush=True)
                # Attendi che Playwright esponga la page
                deadline = time.time() + 8
                while time.time() < deadline and page is None:
                    for p in _iter_pages(browser):
                        try:
                            # match blank/new target roughly: take newest about:blank or empty
                            if (p.url or "") in ("about:blank", "chrome://newtab/", ""):
                                page = p
                                break
                        except Exception:
                            continue
                    if page is None:
                        time.sleep(0.2)
                if page is None:
                    # prendi l'ultima page del context
                    pages = list(context.pages)
                    page = pages[-1] if pages else None
            except Exception as exc:
                print(f"WATCH {product_id[:8]} newWindow fallito ({exc}), uso new_page", flush=True)
                page = None

            if page is None:
                page = context.new_page()
                print(f"WATCH {product_id[:8]} aperta new_page (tab)", flush=True)
            else:
                print(f"WATCH {product_id[:8]} finestra/tab pronta url={page.url!r}", flush=True)

            print(f"WATCH {product_id[:8]} goto AI Mode…", flush=True)
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            print(f"WATCH {product_id[:8]} loaded → {page.url[:140]}", flush=True)

            print(
                f"WATCH {product_id[:8]} attendo {WATCH_INITIAL_WAIT_S:.0f}s generazione…",
                flush=True,
            )
            page.wait_for_timeout(int(WATCH_INITIAL_WAIT_S * 1000))

            try:
                body0 = page.inner_text("body", timeout=5000)
            except Exception:
                body0 = ""

            if g._looks_like_bot_wall(body0):
                print(
                    f"WATCH {product_id[:8]} CAPTCHA — risolvi nella finestra Chrome…",
                    flush=True,
                )
                captcha_deadline = time.time() + WATCH_CAPTCHA_EXTRA_S
                cleared = False
                while time.time() < captcha_deadline:
                    page.wait_for_timeout(4000)
                    try:
                        body = page.inner_text("body", timeout=3000)
                    except Exception:
                        continue
                    if not g._looks_like_bot_wall(body):
                        cleared = True
                        print(f"WATCH {product_id[:8]} captcha ok", flush=True)
                        break
                if not cleared:
                    try:
                        page.close()
                    except Exception:
                        pass
                    return {
                        "ok": False,
                        "error": "captcha — risolvi 'Non sono un robot' e riprova",
                        "captcha": True,
                    }

            print(f"WATCH {product_id[:8]} leggo risposta…", flush=True)
            text = g._wait_for_response(page, timeout_ms=WATCH_RESPONSE_TIMEOUT_MS)
            print(
                f"WATCH {product_id[:8]} testo={len(text or '')} chars",
                flush=True,
            )
        finally:
            if page is not None:
                try:
                    page.close()
                    print(f"WATCH {product_id[:8]} finestra chiusa", flush=True)
                except Exception as exc:
                    print(f"WATCH {product_id[:8]} close warn: {exc}", flush=True)

    result = _save_one(product_id, text)
    result["text"] = (text or "")[:12000]
    result["watched"] = True
    print(
        f"WATCH {product_id[:8]} archive ok={result.get('ok')} err={result.get('error')}",
        flush=True,
    )
    return result


HTML = r"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Google AI tags — manuale</title>
<style>
  :root {
    --bg: #f3efe6;
    --ink: #1c1917;
    --muted: #78716c;
    --line: #d6d3d1;
    --card: #fffcf7;
    --green: #15803d;
    --green-bg: #dcfce7;
    --red: #b91c1c;
    --red-bg: #fee2e2;
    --amber: #b45309;
    --amber-bg: #fef3c7;
    --accent: #0f766e;
    --accent-ink: #fff;
    --col-idx: 48px;
    --col-prompt: 26%;
    --col-paste: 54%;
    --col-status: 120px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--ink);
  }
  header {
    position: sticky; top: 0; z-index: 5;
    background: #1c1917; color: #fafaf9;
    padding: 14px 20px;
    display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center;
    justify-content: space-between;
  }
  header h1 { margin: 0; font-size: 1.05rem; font-weight: 650; letter-spacing: 0.01em; }
  header .meta { color: #a8a29e; font-size: 0.85rem; }
  .pager { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button, .btn {
    appearance: none; border: 0; cursor: pointer;
    background: var(--accent); color: var(--accent-ink);
    padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 0.85rem;
  }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.ghost { background: #44403c; color: #fafaf9; }
  button.open-ai {
    background: #fff; color: var(--ink); border: 1px solid var(--line);
    width: 100%; text-align: left; padding: 10px 12px;
  }
  button.open-ai:hover { border-color: var(--accent); background: #f0fdfa; }
  button.open-ai.opened {
    background: var(--green-bg); border-color: var(--green); color: var(--green);
  }
  main { padding: 16px 18px 40px; }
  .hint {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px 14px; margin-bottom: 14px; color: var(--muted); font-size: 0.9rem;
  }
  .table-wrap {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: auto;
    max-height: calc(100vh - 160px);
  }
  table {
    width: 100%;
    min-width: 900px;
    border-collapse: collapse;
    table-layout: fixed;
  }
  col.c-idx { width: var(--col-idx); }
  col.c-prompt { width: var(--col-prompt); }
  col.c-paste { width: var(--col-paste); }
  col.c-status { width: var(--col-status); }
  th, td {
    padding: 10px 12px;
    vertical-align: top;
    border-bottom: 1px solid var(--line);
    word-wrap: break-word;
  }
  thead th {
    text-align: left;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: #faf7f2;
    position: sticky;
    top: 0;
    z-index: 2;
    box-shadow: inset 0 -1px 0 var(--line);
  }
  td.idx { color: var(--muted); font-variant-numeric: tabular-nums; }
  td.status { text-align: center; }
  .name { font-weight: 650; margin-bottom: 8px; font-size: 0.92rem; line-height: 1.3; }
  textarea {
    width: 100%; min-height: 92px; resize: vertical;
    border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px;
    font: 0.82rem/1.35 ui-monospace, Consolas, monospace; background: #fff;
  }
  textarea:focus { outline: 2px solid #99f6e4; border-color: var(--accent); }
  textarea.pending { border-color: var(--amber); background: #fffbeb; }
  textarea.focus-paste {
    outline: 3px solid #0f766e;
    border-color: #0f766e;
    background: #f0fdfa;
    box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.15);
  }
  .dot {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-width: 72px; padding: 6px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 700;
  }
  .dot.red { background: var(--red-bg); color: var(--red); }
  .dot.green { background: var(--green-bg); color: var(--green); }
  .dot.amber { background: var(--amber-bg); color: var(--amber); }
  .dot::before {
    content: ""; width: 10px; height: 10px; border-radius: 50%; background: currentColor;
  }
  .err { margin-top: 6px; color: var(--red); font-size: 0.78rem; }
  .pending-note { margin-top: 6px; color: var(--amber); font-size: 0.75rem; }
  .loading { padding: 60px 20px; text-align: center; color: var(--muted); }
  .toast {
    position: fixed; right: 16px; bottom: 16px; background: #1c1917; color: #fff;
    padding: 10px 14px; border-radius: 10px; opacity: 0; pointer-events: none;
    transition: opacity .2s; z-index: 20;
  }
  .toast.show { opacity: 1; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Google AI tags — manuale</h1>
    <div class="meta" id="meta">Caricamento…</div>
  </div>
  <div class="pager">
    <button class="ghost" id="prevBtn" type="button">← Prec</button>
    <span id="pageLabel">pagina 1</span>
    <button class="ghost" id="nextBtn" type="button">Succ →</button>
    <button id="reloadBtn" type="button" title="Ricarica lista mancanti da DB">Ricarica DB</button>
  </div>
</header>
<main>
  <div class="hint">
    Click <b>Apri Google AI</b> → si apre a <b>metà destra</b> dello schermo.
    Copia la risposta → <b>Ctrl+V</b> nella colonna 2 (salva da solo dopo 3s). Verde = in DB.
    Tieni questa UI sulla metà sinistra.
  </div>
  <div id="content" class="loading">Sto caricando i prodotti mancanti da Supabase (può richiedere un minuto)…</div>
</main>
<div class="toast" id="toast"></div>
<script>
const PAGE_SIZE = 100;
const AUTOSAVE_MS = 3000;
let page = 0;
let pages = 1;
let total = 0;
const saveTimers = {};
const lastSavedText = {};

function toast(msg, ms) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms || 2200);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || ('HTTP ' + res.status));
    err.payload = data;
    throw err;
  }
  return data;
}

function statusHtml(row) {
  if (row.done) return `<span class="dot green">OK</span>`;
  if (row.error) return `<span class="dot amber">ERR</span><div class="err">${escapeHtml(row.error)}</div>`;
  return `<span class="dot red">TODO</span>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function googleAiUrl(prompt) {
  return 'https://www.google.com/search?udm=50&hl=it&gl=it&q=' + encodeURIComponent(prompt);
}

function focusPasteBox(id) {
  const ta = document.getElementById('ta-' + id);
  if (!ta) return;
  document.querySelectorAll('textarea.focus-paste').forEach(el => el.classList.remove('focus-paste'));
  ta.classList.add('focus-paste');
  ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ta.focus({ preventScroll: true });
  setTimeout(() => {
    ta.focus({ preventScroll: true });
    try { ta.select(); } catch (_) {}
  }, 50);
  setTimeout(() => ta.focus({ preventScroll: true }), 300);
}

function openAiRightHalf(btn, row) {
  const url = googleAiUrl(row.prompt);
  // Metà destra dello schermo (Chrome rispetta width/left se aperto da click utente)
  const gap = 8;
  const w = Math.max(480, Math.floor(screen.availWidth / 2) - gap);
  const h = Math.max(600, screen.availHeight - 40);
  const left = Math.floor(screen.availWidth / 2) + Math.floor(gap / 2);
  const top = Math.max(0, screen.availTop || 0);
  const features = [
    'popup=yes',
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes'
  ].join(',');
  const win = window.open(url, 'giu_google_ai', features);
  if (!win) {
    toast('Popup bloccato — consenti le finestre');
  } else {
    try { win.focus(); } catch (_) {}
    // Riposiziona se il browser ha ignorato left/top al primo open
    try {
      win.moveTo(left, top);
      win.resizeTo(w, h);
    } catch (_) {}
  }
  btn.classList.add('opened');
  btn.textContent = 'Aperto — Ctrl+V qui';
  focusPasteBox(row.id);
  toast('Google a destra — copia e Ctrl+V nella cella evidenziata', 3500);
  const refocus = () => focusPasteBox(row.id);
  window.addEventListener('focus', refocus, { once: true });
  setTimeout(() => {
    btn.classList.remove('opened');
    btn.textContent = 'Apri Google AI';
  }, 2500);
}

async function saveRow(id, { silent } = {}) {
  const ta = document.getElementById('ta-' + id);
  const status = document.getElementById('st-' + id);
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  if (lastSavedText[id] === text) return;

  ta.classList.remove('pending');
  status.innerHTML = `<span class="dot amber">…</span><div class="pending-note">Salvo…</div>`;
  try {
    const data = await api('/api/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id, text: ta.value })
    });
    if (data.ok) {
      lastSavedText[id] = text;
      status.innerHTML = statusHtml({ done: true });
      if (!silent) toast('Archiviato');
      refreshMeta();
    } else {
      status.innerHTML = statusHtml({ done: false, error: data.error || 'errore' });
      if (!silent) toast(data.error || 'Non valido');
    }
  } catch (e) {
    status.innerHTML = statusHtml({ done: false, error: e.message });
    if (!silent) toast(e.message);
  }
}

function scheduleAutosave(id) {
  const ta = document.getElementById('ta-' + id);
  const status = document.getElementById('st-' + id);
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) {
    clearTimeout(saveTimers[id]);
    ta.classList.remove('pending');
    return;
  }
  if (lastSavedText[id] === text) {
    ta.classList.remove('pending');
    return;
  }
  ta.classList.add('pending');
  status.innerHTML = `<span class="dot amber">…</span><div class="pending-note">Salvo tra 3s…</div>`;
  clearTimeout(saveTimers[id]);
  saveTimers[id] = setTimeout(() => saveRow(id), AUTOSAVE_MS);
}

function renderRows(rows, pageNum) {
  if (!rows.length) {
    document.getElementById('content').innerHTML = '<div class="loading">Nessun prodotto in questa pagina.</div>';
    return;
  }
  const start = pageNum * PAGE_SIZE;
  let html = `<div class="table-wrap"><table>
    <colgroup>
      <col class="c-idx" />
      <col class="c-prompt" />
      <col class="c-paste" />
      <col class="c-status" />
    </colgroup>
    <thead><tr>
      <th>#</th>
      <th>1 · Apri Google AI (metà destra)</th>
      <th>2 · Incolla qui (Ctrl+V, auto-salva 3s)</th>
      <th>3 · Stato</th>
    </tr></thead><tbody>`;
  rows.forEach((row, i) => {
    html += `<tr>
      <td class="idx">${start + i + 1}</td>
      <td class="prompt">
        <div class="name">${escapeHtml(row.product_name)}</div>
        <button type="button" class="open-ai" data-id="${row.id}">Apri Google AI</button>
      </td>
      <td class="paste">
        <textarea id="ta-${row.id}" placeholder="Dopo Apri: Ctrl+V qui (focus automatico)"></textarea>
      </td>
      <td class="status" id="st-${row.id}">${statusHtml(row)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  const content = document.getElementById('content');
  content.innerHTML = html;

  content.querySelectorAll('button.open-ai').forEach(btn => {
    const id = btn.getAttribute('data-id');
    const row = rows.find(r => r.id === id);
    btn.addEventListener('click', () => openAiRightHalf(btn, row));
  });
  content.querySelectorAll('textarea').forEach(ta => {
    const id = ta.id.replace(/^ta-/, '');
    ta.addEventListener('paste', () => {
      ta.classList.remove('focus-paste');
      setTimeout(() => scheduleAutosave(id), 0);
    });
    ta.addEventListener('input', () => scheduleAutosave(id));
  });
}

async function refreshMeta() {
  const st = await api('/api/state');
  total = st.total;
  pages = st.pages;
  document.getElementById('meta').textContent =
    `${st.done_ok} archiviati in sessione · ${st.total} in coda · pagina ${page+1}/${pages}` +
    (st.loading ? ' · caricamento…' : '') +
    (st.load_error ? ' · ERR: ' + st.load_error : '');
  document.getElementById('pageLabel').textContent = `pagina ${page+1} / ${pages}`;
  document.getElementById('prevBtn').disabled = page <= 0 || st.loading;
  document.getElementById('nextBtn').disabled = page >= pages - 1 || st.loading;
}

async function loadPage() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading">Carico pagina…</div>';
  const st = await api('/api/state');
  if (st.loading) {
    content.innerHTML = '<div class="loading">Sto caricando i prodotti mancanti da Supabase…</div>';
    await refreshMeta();
    setTimeout(loadPage, 2000);
    return;
  }
  if (st.load_error) {
    content.innerHTML = `<div class="loading">Errore: ${escapeHtml(st.load_error)}</div>`;
    await refreshMeta();
    return;
  }
  const data = await api(`/api/page?page=${page}&size=${PAGE_SIZE}`);
  pages = data.pages;
  total = data.total;
  renderRows(data.rows, page);
  await refreshMeta();
}

document.getElementById('prevBtn').onclick = () => { if (page > 0) { page--; loadPage(); } };
document.getElementById('nextBtn').onclick = () => { page++; loadPage(); };
document.getElementById('reloadBtn').onclick = async () => {
  document.getElementById('content').innerHTML = '<div class="loading">Ricarico da DB…</div>';
  await api('/api/reload', { method: 'POST' });
  page = 0;
  loadPage();
};

loadPage();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send(code, raw, "application/json; charset=utf-8")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path in {"/", "/index.html"}:
            self._send(200, HTML.encode("utf-8"), "text/html; charset=utf-8")
            return

        if path == "/api/state":
            with _state_lock:
                total = len(_products)
                done_ok = sum(1 for v in _done.values() if v.get("ok"))
                loading = _loading
                load_error = _load_error
            size = PAGE_SIZE
            pages = max(1, (total + size - 1) // size) if total else 1
            self._json(
                200,
                {
                    "loading": loading,
                    "load_error": load_error,
                    "total": total,
                    "pages": pages,
                    "page_size": size,
                    "done_ok": done_ok,
                    "run_key": _run_key,
                    "cdp_ok": _probe_cdp(),
                    "cdp_url": CDP_URL,
                },
            )
            return

        if path == "/api/page":
            page = int((qs.get("page") or ["0"])[0])
            size = int((qs.get("size") or [str(PAGE_SIZE)])[0])
            size = max(1, min(200, size))
            if _loading:
                self._json(200, {"rows": [], "total": 0, "pages": 1, "page": page, "loading": True})
                return
            rows, total, pages = _page_slice(page, size)
            self._json(
                200,
                {"rows": rows, "total": total, "pages": pages, "page": page, "loading": False},
            )
            return

        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "JSON non valido"})
            return

        if path == "/api/save":
            pid = str(payload.get("id") or "")
            text = str(payload.get("text") or "")
            if not pid:
                self._json(400, {"error": "id mancante"})
                return
            try:
                result = _save_one(pid, text)
                self._json(200 if result.get("ok") else 422, result)
            except Exception as exc:
                self._json(500, {"error": f"{type(exc).__name__}: {exc}"})
            return

        if path == "/api/watch":
            pid = str(payload.get("id") or "")
            if not pid:
                self._json(400, {"error": "id mancante"})
                return
            print(f"HTTP /api/watch id={pid[:8]}", flush=True)
            try:
                result = _watch_and_archive(pid)
                code = 200 if result.get("ok") else 422
                self._json(code, result)
            except Exception as exc:
                traceback.print_exc()
                self._json(500, {"error": f"{type(exc).__name__}: {exc}"})
            return

        if path == "/api/reload":
            global _loading, _products, _done
            with _state_lock:
                if _loading:
                    self._json(200, {"ok": True, "note": "già in caricamento"})
                    return
                _loading = True
                _products = []
                _done = {}
            threading.Thread(target=_load_products, daemon=True).start()
            self._json(200, {"ok": True})
            return

        self._json(404, {"error": "not found"})


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    threading.Thread(target=_load_products, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"UI manuale: http://{HOST}:{PORT}", flush=True)
    print(f"CDP: {CDP_URL} ({'OK' if _probe_cdp() else 'OFF — avvia start_chrome_human.ps1 -UseMyChrome'})", flush=True)
    print("Apri la UI DENTRO il Chrome con debug, altrimenti lo scraper non vede le finestre.", flush=True)
    print("Ctrl+C per uscire.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStop.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
