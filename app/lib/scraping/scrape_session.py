from datetime import datetime, timezone

from supabase import Client


def fetch_recent_sessions(
    supabase: Client, ecommerce_id: str, limit: int = 3
) -> list[dict]:
    response = (
        supabase.table("scraped_product")
        .select("update_session_id, update_at")
        .eq("ecommerce_id", ecommerce_id)
        .not_.is_("update_session_id", "null")
        .execute()
    )

    by_session: dict[str, dict[str, int | str | None]] = {}
    for row in response.data or []:
        session_id = row.get("update_session_id")
        if not session_id:
            continue

        updated_at = row.get("update_at")
        if session_id not in by_session:
            by_session[session_id] = {"count": 0, "last_at": updated_at}

        by_session[session_id]["count"] = int(by_session[session_id]["count"]) + 1
        last_at = by_session[session_id]["last_at"]
        if updated_at and (not last_at or updated_at > last_at):
            by_session[session_id]["last_at"] = updated_at

    sorted_sessions = sorted(by_session.items(), key=lambda item: item[0], reverse=True)
    return [
        {
            "session_id": session_id,
            "count": meta["count"],
            "last_at": meta["last_at"],
        }
        for session_id, meta in sorted_sessions[:limit]
    ]


def default_session_id() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def prompt_session_id(supabase: Client, ecommerce_id: str, label: str) -> str:
    sessions = fetch_recent_sessions(supabase, ecommerce_id)
    default_id = default_session_id()

    print()
    print(f"Session ID scraping ({label})")
    if sessions:
        print("Ultimi session ID usati:")
        for index, session in enumerate(sessions, start=1):
            last_at = session["last_at"] or "?"
            print(
                f"  {index}. {session['session_id']}  —  "
                f"{session['count']} prodotti  —  ultimo aggiornamento ~{last_at}"
            )
    else:
        print("Nessuna sessione precedente trovata per questo e-commerce.")

    print()
    print(f'Premi Invio per usare il timestamp corrente: {default_id}')
    print("Oppure inserisci un session ID (esistente o nuovo):")
    raw = input("> ").strip()
    session_id = raw if raw else default_id
    print(f"Session ID selezionato: {session_id}")
    return session_id
