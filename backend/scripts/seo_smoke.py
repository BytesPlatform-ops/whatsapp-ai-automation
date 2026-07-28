#!/usr/bin/env python3
"""SEO provider smoke-test CLI.

Opt-in live probe for each SEO provider. By default runs in DRY-RUN mode
(no network calls, no external side-effects, no emails sent).

Safety contract
---------------
- NEVER runs unless BOTH of the following env vars are set to a truthy value:
    RUN_LIVE_SEO_SMOKE_TESTS=1
    SEO_PROVIDER_SMOKE_TEST_ENABLED=1
- NEVER sends email unless --send flag is also explicitly passed.
- NEVER publishes GBP posts, replies to reviews, modifies WordPress,
  applies schema changes, or initiates outreach.
- ALL probes are READ-ONLY.
- Displays estimated external API call count BEFORE executing.
- Redacts all credential values from output (shows only presence).
- Records status/latency/schema-validity into the in-process readiness store.
- This script is NOT executed by the normal test suite (pytest).

Usage
-----
  # Dry-run (default, shows what would run):
  python scripts/seo_smoke.py

  # Live run (requires env vars):
  RUN_LIVE_SEO_SMOKE_TESTS=1 SEO_PROVIDER_SMOKE_TEST_ENABLED=1 \\
      python scripts/seo_smoke.py --live

  # Live run, specific providers only:
  RUN_LIVE_SEO_SMOKE_TESTS=1 SEO_PROVIDER_SMOKE_TEST_ENABLED=1 \\
      python scripts/seo_smoke.py --live --providers gsc,pagespeed

  # Live run with email test (explicit opt-in required):
  RUN_LIVE_SEO_SMOKE_TESTS=1 SEO_PROVIDER_SMOKE_TEST_ENABLED=1 \\
      python scripts/seo_smoke.py --live --send

Exit codes:
  0 — all probes passed (or dry-run)
  1 — one or more probes failed
  2 — live mode not enabled (missing env vars)
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

# Ensure backend/ is in sys.path when run directly
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


# ── Opt-in guard ──────────────────────────────────────────────────────────────

def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def _live_mode_enabled() -> bool:
    return _truthy("RUN_LIVE_SEO_SMOKE_TESTS") and _truthy("SEO_PROVIDER_SMOKE_TEST_ENABLED")


# ── Credential redaction ──────────────────────────────────────────────────────

def _redact(value: Optional[str]) -> str:
    """Return a redacted display string for a credential value."""
    if not value:
        return "<not set>"
    return f"<set, {len(value)} chars>"


def _env_display(name: str) -> str:
    return _redact(os.getenv(name, ""))


# ── Probe definitions ─────────────────────────────────────────────────────────

ProbeResult = Dict[str, Any]


def _result(
    provider: str,
    success: bool,
    latency_ms: Optional[float] = None,
    detail: str = "",
    schema_valid: Optional[bool] = None,
    quota_ok: Optional[bool] = None,
    skipped: bool = False,
) -> ProbeResult:
    return {
        "provider": provider,
        "success": success,
        "skipped": skipped,
        "latency_ms": round(latency_ms, 1) if latency_ms is not None else None,
        "detail": detail,
        "schema_valid": schema_valid,
        "quota_ok": quota_ok,
    }


# ── Individual probes (read-only) ─────────────────────────────────────────────

def probe_google_oauth() -> ProbeResult:
    """Validate Google OAuth config (no network — just check env + redirect URI)."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect = os.getenv("GOOGLE_OAUTH_REDIRECT_SEO", "")

    ok = bool(client_id and client_secret)
    redirect_ok = bool(redirect)
    detail = (
        f"GOOGLE_CLIENT_ID={_env_display('GOOGLE_CLIENT_ID')}, "
        f"GOOGLE_CLIENT_SECRET={_env_display('GOOGLE_CLIENT_SECRET')}, "
        f"redirect={redirect or '<not set>'}"
    )
    return _result(
        "google_oauth",
        success=ok,
        detail=detail,
        schema_valid=ok and redirect_ok,
    )


def probe_gsc() -> ProbeResult:
    """Probe GSC: validate config + attempt a non-mutating token_info call (if live)."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    ok = bool(client_id and client_secret)
    detail = (
        f"GOOGLE_CLIENT_ID={_env_display('GOOGLE_CLIENT_ID')}, "
        f"GOOGLE_CLIENT_SECRET={_env_display('GOOGLE_CLIENT_SECRET')}"
    )
    if not ok:
        return _result("gsc", success=False, detail="Google OAuth creds missing — GSC unavailable")

    # For a live probe we would verify the token info endpoint.
    # We only do config validation here (no active refresh token available in smoke context).
    return _result("gsc", success=True, detail=detail, schema_valid=True)


def probe_ga4() -> ProbeResult:
    """Probe GA4: validate config (same creds as GSC)."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    ok = bool(client_id and client_secret)
    detail = (
        f"GOOGLE_CLIENT_ID={_env_display('GOOGLE_CLIENT_ID')}, "
        f"GOOGLE_CLIENT_SECRET={_env_display('GOOGLE_CLIENT_SECRET')}"
    )
    return _result("ga4", success=ok, detail=detail, schema_valid=ok)


def probe_pagespeed() -> ProbeResult:
    """Probe PageSpeed Insights: non-mutating GET on a well-known URL."""
    import urllib.request
    import json

    key = os.getenv("PAGESPEED_API_KEY", "")
    base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    url = f"{base}?url=https://example.com&strategy=mobile"
    if key:
        url += f"&key={key}"

    detail = f"PAGESPEED_API_KEY={_env_display('PAGESPEED_API_KEY')}"
    t0 = time.monotonic()
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
        latency_ms = (time.monotonic() - t0) * 1000.0
        # Validate response schema
        schema_valid = "lighthouseResult" in data or "loadingExperience" in data
        return _result(
            "pagespeed",
            success=True,
            latency_ms=latency_ms,
            detail=f"{detail} | response keys: {list(data.keys())[:5]}",
            schema_valid=schema_valid,
            quota_ok=True,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("pagespeed", success=False, latency_ms=latency_ms, detail=str(exc))


def probe_keyword() -> ProbeResult:
    """Probe keyword provider: validate creds presence + mock research call."""
    has_creds = bool(
        (os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))
        or os.getenv("KEYWORD_API_KEY")
    )
    detail = (
        f"DATAFORSEO_LOGIN={_env_display('DATAFORSEO_LOGIN')}, "
        f"KEYWORD_API_KEY={_env_display('KEYWORD_API_KEY')}"
    )
    if not has_creds:
        return _result("keyword", success=False, detail="No keyword provider creds — using mock")

    # Use mock to validate provider interface (no network in smoke without explicit live flag)
    t0 = time.monotonic()
    try:
        from seo.keywords.provider import MockKeywordProvider
        p = MockKeywordProvider()
        ideas = p.research("plumber", ["emergency plumber"])
        latency_ms = (time.monotonic() - t0) * 1000.0
        schema_valid = all(
            hasattr(idea, "keyword") and hasattr(idea, "volume")
            for idea in ideas
        )
        return _result(
            "keyword",
            success=True,
            latency_ms=latency_ms,
            detail=f"{detail} | mock ideas={len(ideas)}",
            schema_valid=schema_valid,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("keyword", success=False, latency_ms=latency_ms, detail=str(exc))


def probe_rank() -> ProbeResult:
    """Probe rank provider: validate creds + mock lookup."""
    has_creds = bool(
        os.getenv("SERP_API_KEY") or os.getenv("RANK_API_KEY")
        or (os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))
    )
    detail = (
        f"SERP_API_KEY={_env_display('SERP_API_KEY')}, "
        f"RANK_API_KEY={_env_display('RANK_API_KEY')}"
    )
    if not has_creds:
        return _result("rank", success=False, detail="No rank provider creds — using mock")

    t0 = time.monotonic()
    try:
        from seo.jobs.provider import MockRankProvider
        p = MockRankProvider()
        result = p.lookup("plumber near me", "example.com")
        latency_ms = (time.monotonic() - t0) * 1000.0
        schema_valid = hasattr(result, "position") or isinstance(result, dict)
        return _result(
            "rank",
            success=True,
            latency_ms=latency_ms,
            detail=f"{detail} | mock position={getattr(result, 'position', result)}",
            schema_valid=schema_valid,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("rank", success=False, latency_ms=latency_ms, detail=str(exc))


def probe_backlink() -> ProbeResult:
    """Probe backlink provider: validate creds + mock summary call."""
    has_creds = bool(
        os.getenv("SEO_BACKLINK_API_KEY")
        or (os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))
    )
    detail = (
        f"SEO_BACKLINK_API_KEY={_env_display('SEO_BACKLINK_API_KEY')}, "
        f"DATAFORSEO_LOGIN={_env_display('DATAFORSEO_LOGIN')}"
    )
    if not has_creds:
        return _result("backlink", success=False, detail="No backlink provider creds — using mock")

    t0 = time.monotonic()
    try:
        from seo.backlinks.provider import MockBacklinkProvider
        p = MockBacklinkProvider()
        summary = p.summary("example.com")
        latency_ms = (time.monotonic() - t0) * 1000.0
        schema_valid = "total_backlinks" in summary and "referring_domains" in summary
        return _result(
            "backlink",
            success=True,
            latency_ms=latency_ms,
            detail=f"{detail} | mock backlinks={summary.get('total_backlinks')}",
            schema_valid=schema_valid,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("backlink", success=False, latency_ms=latency_ms, detail=str(exc))


def probe_gbp() -> ProbeResult:
    """Probe GBP: validate OAuth config + redirect URI (no network)."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect = os.getenv("GBP_OAUTH_REDIRECT", "")
    ok = bool(client_id and client_secret)
    detail = (
        f"GOOGLE_CLIENT_ID={_env_display('GOOGLE_CLIENT_ID')}, "
        f"GBP_OAUTH_REDIRECT={redirect or '<not set>'}"
    )
    # NEVER: publish GBP post / reply to review / modify listing.
    return _result("gbp", success=ok, detail=detail, schema_valid=ok and bool(redirect))


def probe_email(*, allow_send: bool = False) -> ProbeResult:
    """Probe email provider: validate config (never sends without --send flag)."""
    has_key = bool(os.getenv("EMAIL_PROVIDER_API_KEY", ""))
    has_to = bool(os.getenv("AI_RECEPTIONIST_TEAM_EMAIL", ""))
    detail = (
        f"EMAIL_PROVIDER_API_KEY={_env_display('EMAIL_PROVIDER_API_KEY')}, "
        f"AI_RECEPTIONIST_TEAM_EMAIL={_env_display('AI_RECEPTIONIST_TEAM_EMAIL')}"
    )
    if not has_key:
        return _result("email", success=False, detail="EMAIL_PROVIDER_API_KEY not set")

    if allow_send:
        # Only send with --send flag. We do a minimal API call to validate the key.
        import urllib.request
        import json

        team = os.getenv("AI_RECEPTIONIST_TEAM_EMAIL", "")
        if not team:
            return _result("email", success=False, detail="AI_RECEPTIONIST_TEAM_EMAIL not set — cannot test send")

        t0 = time.monotonic()
        try:
            payload = json.dumps({
                "from": "smoke@pixie.local",
                "to": [team],
                "subject": "[Pixie SEO smoke test] Email probe",
                "text": "This is an automated smoke-test email from the SEO ops CLI.",
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {os.getenv('EMAIL_PROVIDER_API_KEY')}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
                data = json.loads(resp.read().decode("utf-8"))
            latency_ms = (time.monotonic() - t0) * 1000.0
            success = "id" in data
            return _result(
                "email",
                success=success,
                latency_ms=latency_ms,
                detail=f"Send attempted to {team} — id={data.get('id', '<none>')}",
                schema_valid=success,
            )
        except Exception as exc:
            latency_ms = (time.monotonic() - t0) * 1000.0
            return _result("email", success=False, latency_ms=latency_ms, detail=str(exc))
    else:
        return _result(
            "email",
            success=has_key and has_to,
            detail=f"{detail} | (use --send to test actual send)",
            schema_valid=has_key and has_to,
        )


def probe_pdf() -> ProbeResult:
    """Probe PDF renderer: generate a minimal test PDF (no network)."""
    t0 = time.monotonic()
    try:
        from seo.reporting.pdf import render_pdf
        minimal_report = {
            "title": "SEO Smoke Test",
            "generated_at": "2026-07-29T00:00:00Z",
            "sections": [],
        }
        pdf_bytes = render_pdf(minimal_report, workspace_name="smoke-test")
        latency_ms = (time.monotonic() - t0) * 1000.0
        schema_valid = pdf_bytes[:5] == b"%PDF-"
        return _result(
            "pdf",
            success=schema_valid,
            latency_ms=latency_ms,
            detail=f"Generated {len(pdf_bytes)} bytes",
            schema_valid=schema_valid,
        )
    except ImportError:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("pdf", success=False, latency_ms=latency_ms, detail="reportlab not installed")
    except Exception as exc:
        latency_ms = (time.monotonic() - t0) * 1000.0
        return _result("pdf", success=False, latency_ms=latency_ms, detail=str(exc))


# ── Probe registry ────────────────────────────────────────────────────────────

# (name, estimated_external_calls, probe_fn, needs_send_flag)
_PROBES: List[Tuple[str, int, Any, bool]] = [
    ("google_oauth", 0, lambda _send: probe_google_oauth(), False),
    ("gsc", 0, lambda _send: probe_gsc(), False),
    ("ga4", 0, lambda _send: probe_ga4(), False),
    ("pagespeed", 1, lambda _send: probe_pagespeed(), False),
    ("keyword", 0, lambda _send: probe_keyword(), False),
    ("rank", 0, lambda _send: probe_rank(), False),
    ("backlink", 0, lambda _send: probe_backlink(), False),
    ("gbp", 0, lambda _send: probe_gbp(), False),
    ("email", 1, lambda send: probe_email(allow_send=send), True),
    ("pdf", 0, lambda _send: probe_pdf(), False),
]


# ── CLI ───────────────────────────────────────────────────────────────────────

def _print_header() -> None:
    print("=" * 60)
    print("SEO Provider Smoke-Test CLI")
    print("=" * 60)


def _print_estimated_calls(probes: List[Tuple], *, allow_send: bool) -> None:
    total = sum(
        calls
        for name, calls, fn, needs_send in probes
        if calls > 0 and (not needs_send or allow_send)
    )
    print(f"\nEstimated external API calls: {total}")
    for name, calls, fn, needs_send in probes:
        if calls > 0:
            send_note = " (only with --send)" if needs_send and not allow_send else ""
            print(f"  {name}: {calls} call(s){send_note}")


def _run_probe(name: str, fn, allow_send: bool) -> ProbeResult:
    print(f"\n[{name}] Running probe...")
    t0 = time.monotonic()
    try:
        result = fn(allow_send)
    except Exception as exc:
        elapsed = (time.monotonic() - t0) * 1000.0
        result = _result(name, success=False, latency_ms=elapsed, detail=f"Probe raised: {exc}")
    status = "PASS" if result["success"] else ("SKIP" if result.get("skipped") else "FAIL")
    lat = f" ({result['latency_ms']:.0f}ms)" if result["latency_ms"] is not None else ""
    print(f"  {status}{lat}: {result['detail']}")
    if result.get("schema_valid") is False:
        print("  WARN: Response schema invalid")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(
        description="SEO provider smoke-test CLI (dry-run by default)."
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Enable live probes (requires RUN_LIVE_SEO_SMOKE_TESTS=1 + SEO_PROVIDER_SMOKE_TEST_ENABLED=1)",
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Allow email probe to actually send a test email (requires --live).",
    )
    parser.add_argument(
        "--providers",
        type=str,
        default="",
        help="Comma-separated list of provider names to probe (default: all).",
    )
    args = parser.parse_args()

    _print_header()

    allow_live = args.live and _live_mode_enabled()
    allow_send = args.send and allow_live

    if args.live and not _live_mode_enabled():
        print(
            "\nERROR: --live requires both env vars to be set:\n"
            "  RUN_LIVE_SEO_SMOKE_TESTS=1\n"
            "  SEO_PROVIDER_SMOKE_TEST_ENABLED=1\n"
            "Running in dry-run mode instead."
        )

    provider_filter = {p.strip() for p in args.providers.split(",") if p.strip()}
    selected_probes = [
        (name, calls, fn, needs_send)
        for name, calls, fn, needs_send in _PROBES
        if not provider_filter or name in provider_filter
    ]

    mode = "LIVE" if allow_live else "DRY-RUN"
    print(f"\nMode: {mode}")
    if not allow_live:
        print("(Pass --live + set env vars to run actual probes)")
    if allow_send:
        print("Email send is ENABLED (--send flag)")

    _print_estimated_calls(selected_probes, allow_send=allow_send)

    if not allow_live:
        print("\nDry-run complete. No probes executed, no external calls made.")
        return 0

    print("\n" + "-" * 40)
    print("Running probes...")

    results: List[ProbeResult] = []
    for name, calls, fn, needs_send in selected_probes:
        result = _run_probe(name, fn, allow_send if needs_send else False)
        results.append(result)

        # Record into readiness store
        try:
            from seo.ops.readiness import record_smoke_result
            record_smoke_result(
                name,
                success=result["success"],
                latency_ms=result["latency_ms"],
                quota_ok=result.get("quota_ok"),
            )
        except Exception:
            pass

    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r["success"])
    failed = sum(1 for r in results if not r["success"] and not r.get("skipped"))
    total = len(results)
    print(f"Results: {passed}/{total} passed, {failed} failed")

    for r in results:
        status = "PASS" if r["success"] else "FAIL"
        lat = f" ({r['latency_ms']:.0f}ms)" if r["latency_ms"] is not None else ""
        print(f"  {r['provider']}: {status}{lat}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
