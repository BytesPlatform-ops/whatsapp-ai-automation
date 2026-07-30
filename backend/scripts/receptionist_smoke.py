"""AI Receptionist provider smoke-test CLI (Wave 8, Part 25). NOT run in tests.

Safe by default: dry-run, read-only, no email sent, no Calendar event created, no
migration applied. Live calls require explicit opt-in env flags AND a tenant with a
real Google connection; writes require a SECOND explicit flag. Credentials and
message content are redacted; only counts / schema-validity / latency are printed.

Usage:
    python scripts/receptionist_smoke.py plan                 # show estimated calls (dry-run)
    RUN_LIVE_RECEPTIONIST_GMAIL_READ_TESTS=1 \\
        python scripts/receptionist_smoke.py gmail-read --tenant t_x
    RUN_LIVE_RECEPTIONIST_CALENDAR_READ_TESTS=1 \\
        python scripts/receptionist_smoke.py calendar-read --tenant t_x
    RUN_LIVE_RECEPTIONIST_GMAIL_SEND_TESTS=1 \\
        python scripts/receptionist_smoke.py gmail-send --tenant t_x --to you@test  # write
    RUN_LIVE_RECEPTIONIST_WHATSAPP_READ_TESTS=1 \\
        python scripts/receptionist_smoke.py whatsapp-read --tenant t_x
    RUN_LIVE_RECEPTIONIST_WHATSAPP_SEND_TESTS=1 \\
        python scripts/receptionist_smoke.py whatsapp-send --tenant t_x --to 15551230000  # write
    RUN_LIVE_RECEPTIONIST_INSTAGRAM_READ_TESTS=1 \\
        python scripts/receptionist_smoke.py instagram-read --tenant t_x
    RUN_LIVE_RECEPTIONIST_MESSENGER_READ_TESTS=1 \\
        python scripts/receptionist_smoke.py messenger-read --tenant t_x
    RUN_LIVE_RECEPTIONIST_INSTAGRAM_SEND_TESTS=1 \\
        python scripts/receptionist_smoke.py instagram-send --tenant t_x --to 178XXXXXXXX  # write
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _timed(label: str, fn):
    t0 = time.monotonic()
    try:
        result = fn()
        ok, detail = True, "ok"
    except Exception as exc:  # never print secrets/content
        result, ok, detail = None, False, type(exc).__name__
    ms = int((time.monotonic() - t0) * 1000)
    print(f"  [{'OK ' if ok else 'ERR'}] {label:32} {ms:5d}ms  {detail}")
    return ok, result


def cmd_plan() -> int:
    print("Smoke plan (dry-run — no live calls):")
    print("  gmail-read     → profile (1) + list<=5 (1)                 [RUN_LIVE_RECEPTIONIST_GMAIL_READ_TESTS]")
    print("  gmail-send     → build+send 1 (WRITE)                      [RUN_LIVE_RECEPTIONIST_GMAIL_SEND_TESTS]")
    print("  calendar-read  → list (1) + free/busy 1 bounded (1)        [RUN_LIVE_RECEPTIONIST_CALENDAR_READ_TESTS]")
    print("  calendar-write → create test event + delete (WRITE)        [RUN_LIVE_RECEPTIONIST_CALENDAR_WRITE_TESTS]")
    print("  whatsapp-read  → validate + wabas + phone-numbers + templates [RUN_LIVE_RECEPTIONIST_WHATSAPP_READ_TESTS]")
    print("  whatsapp-send  → send 1 free-form text (WRITE, 24h window)   [RUN_LIVE_RECEPTIONIST_WHATSAPP_SEND_TESTS]")
    print("  instagram-read → validate + list accounts                    [RUN_LIVE_RECEPTIONIST_INSTAGRAM_READ_TESTS]")
    print("  instagram-send → send 1 DM (WRITE, open window)              [RUN_LIVE_RECEPTIONIST_INSTAGRAM_SEND_TESTS]")
    print("  messenger-read → validate + list pages                       [RUN_LIVE_RECEPTIONIST_MESSENGER_READ_TESTS]")
    print("  messenger-send → send 1 message (WRITE, open window)         [RUN_LIVE_RECEPTIONIST_MESSENGER_SEND_TESTS]")
    print("Defaults: dry-run, read-only, credentials + content redacted.")
    return 0


def _require(flag: str) -> bool:
    if not _flag(flag):
        print(f"BLOCKED: {flag} is not set — live smoke test is opt-in. (dry-run)")
        return False
    return True


def cmd_gmail_read(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_GMAIL_READ_TESTS"):
        return cmd_plan()
    from receptionist.providers import gmail
    print(f"gmail-read (tenant redacted, read-only):")
    _timed("profile", lambda: _run(gmail.get_profile(tenant)))
    _timed("list<=5", lambda: _run(gmail.list_messages(tenant, query="in:inbox", max_results=5)))
    return 0


def cmd_gmail_send(tenant: str, to: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_GMAIL_SEND_TESTS"):
        return cmd_plan()
    if not to:
        print("ERR: --to is required for a send smoke test (use a safe test inbox).")
        return 2
    from receptionist.providers import gmail
    print("gmail-send (WRITE — sending ONE message to the supplied safe test address):")
    _timed("send", lambda: _run(gmail.send_reply(tenant, to=to, subject="Pixie smoke test",
                                                 body="Automated read/write smoke test — please ignore.")))
    return 0


def cmd_calendar_read(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_CALENDAR_READ_TESTS"):
        return cmd_plan()
    from receptionist.providers import gcal
    print("calendar-read (read-only):")
    _timed("list", lambda: _run(gcal.list_calendars(tenant)))
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    _timed("free/busy", lambda: _run(gcal.get_free_busy(tenant, ["primary"],
                                                        now.isoformat(), (now + timedelta(days=1)).isoformat())))
    return 0


def cmd_calendar_write(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_CALENDAR_WRITE_TESTS"):
        return cmd_plan()
    from receptionist.providers import gcal
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc) + timedelta(days=1)
    print("calendar-write (WRITE — creates then deletes ONE test event):")
    ok, ev = _timed("create", lambda: _run(gcal.create_event(tenant, "primary", {
        "summary": "Pixie smoke test (delete me)",
        "start": {"dateTime": now.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": (now + timedelta(minutes=15)).isoformat(), "timeZone": "UTC"}})))
    if ok and ev and ev.get("event_id"):
        _timed("cleanup", lambda: _run(gcal.cancel_event(tenant, "primary", ev["event_id"])))
    return 0


def cmd_whatsapp_read(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_WHATSAPP_READ_TESTS"):
        return cmd_plan()
    from receptionist.providers import whatsapp_cloud as wa
    print("whatsapp-read (read-only — counts/state only, tokens redacted):")
    _timed("validate", lambda: wa.validate_connection(tenant))
    ok, wabas = _timed("wabas", lambda: wa.list_business_accounts(tenant))
    if ok and wabas:
        waba_id = wabas[0].get("waba_id", "")
        _timed("phone-numbers", lambda: wa.list_phone_numbers(tenant, waba_id))
    _timed("templates", lambda: wa.list_templates(tenant))
    return 0


def cmd_whatsapp_send(tenant: str, to: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_WHATSAPP_SEND_TESTS"):
        return cmd_plan()
    if not to:
        print("ERR: --to is required for a send smoke test (use a safe test number in E.164 digits).")
        return 2
    from receptionist.providers import whatsapp_cloud as wa
    print("whatsapp-send (WRITE — ONE free-form text; requires an open 24h window):")
    _timed("send", lambda: wa.send_text(tenant, to=to,
                                        body="Automated Pixie smoke test — please ignore."))
    return 0


def cmd_instagram_read(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_INSTAGRAM_READ_TESTS"):
        return cmd_plan()
    from receptionist.providers import instagram_messaging as ig
    print("instagram-read (read-only — counts/state only, tokens redacted):")
    _timed("validate", lambda: ig.validate_connection(tenant))
    _timed("accounts", lambda: ig.list_accounts(tenant))
    return 0


def cmd_instagram_send(tenant: str, to: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_INSTAGRAM_SEND_TESTS"):
        return cmd_plan()
    if not to:
        print("ERR: --to is required for a send smoke test (use a safe test recipient id).")
        return 2
    from receptionist.providers import instagram_messaging as ig
    print("instagram-send (WRITE — ONE DM; requires an open messaging window):")
    _timed("send", lambda: ig.send_text(tenant, to=to, body="Automated Pixie smoke test — please ignore."))
    return 0


def cmd_messenger_read(tenant: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_MESSENGER_READ_TESTS"):
        return cmd_plan()
    from receptionist.providers import messenger as fb
    print("messenger-read (read-only — counts/state only, tokens redacted):")
    _timed("validate", lambda: fb.validate_connection(tenant))
    _timed("pages", lambda: fb.list_pages(tenant))
    return 0


def cmd_messenger_send(tenant: str, to: str) -> int:
    if not _require("RUN_LIVE_RECEPTIONIST_MESSENGER_SEND_TESTS"):
        return cmd_plan()
    if not to:
        print("ERR: --to is required for a send smoke test (use a safe test PSID).")
        return 2
    from receptionist.providers import messenger as fb
    print("messenger-send (WRITE — ONE message; requires an open messaging window):")
    _timed("send", lambda: fb.send_text(tenant, to=to, body="Automated Pixie smoke test — please ignore."))
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Receptionist provider smoke tests (default: dry-run plan)")
    p.add_argument("command", nargs="?", default="plan",
                   choices=["plan", "gmail-read", "gmail-send", "calendar-read", "calendar-write",
                            "whatsapp-read", "whatsapp-send", "meta-messaging-plan",
                            "instagram-read", "instagram-send", "messenger-read", "messenger-send"])
    p.add_argument("--tenant", default="")
    p.add_argument("--to", default="")
    args = p.parse_args()
    if args.command in ("plan", "meta-messaging-plan"):
        return cmd_plan()
    if not args.tenant:
        print("ERR: --tenant is required for live smoke tests.")
        return 2
    return {
        "gmail-read": lambda: cmd_gmail_read(args.tenant),
        "gmail-send": lambda: cmd_gmail_send(args.tenant, args.to),
        "calendar-read": lambda: cmd_calendar_read(args.tenant),
        "calendar-write": lambda: cmd_calendar_write(args.tenant),
        "whatsapp-read": lambda: cmd_whatsapp_read(args.tenant),
        "whatsapp-send": lambda: cmd_whatsapp_send(args.tenant, args.to),
        "instagram-read": lambda: cmd_instagram_read(args.tenant),
        "instagram-send": lambda: cmd_instagram_send(args.tenant, args.to),
        "messenger-read": lambda: cmd_messenger_read(args.tenant),
        "messenger-send": lambda: cmd_messenger_send(args.tenant, args.to),
    }[args.command]()


if __name__ == "__main__":
    raise SystemExit(main())
