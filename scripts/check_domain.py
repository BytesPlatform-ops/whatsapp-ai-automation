#!/usr/bin/env python3
"""
NameSilo Domain Availability Checker — CLI tool.

Give it a base name, it queries NameSilo's API and prints which TLD
variants are available with their wholesale prices.

Uses stdlib only — no pip install needed.

Usage:
    python3 scripts/check_domain.py <basename>
    python3 scripts/check_domain.py anshplumbing
    python3 scripts/check_domain.py glowstudio --tlds com,co,io,shop,store
    python3 scripts/check_domain.py                  # prompts interactively

Reads NAMESILO_API_KEY from .env (same file Node uses).
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

# macOS Python sometimes ships without up-to-date CA certs, which breaks
# HTTPS verification. We try certifi's bundle first (stdlib fallback if
# not installed). Run `pip3 install certifi` if the fallback also fails.
def _build_ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

SSL_CTX = _build_ssl_context()

NAMESILO_BASE = "https://www.namesilo.com/api"
DEFAULT_TLDS = ["com", "co", "io", "net", "org", "app", "dev", "xyz", "shop", "store"]


def load_env():
    """Tiny .env loader so we don't require python-dotenv as a dep."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Don't overwrite variables already set in the real environment
        if key and key not in os.environ:
            os.environ[key] = value


def ns_request(endpoint: str, params: dict) -> dict:
    """Make a GET request to NameSilo, return parsed `reply` block."""
    api_key = os.environ.get("NAMESILO_API_KEY")
    if not api_key:
        print("❌ NAMESILO_API_KEY not found in .env or environment.", file=sys.stderr)
        sys.exit(1)

    full_params = {
        "version": "1",
        "type": "json",
        "key": api_key,
        **params,
    }
    url = f"{NAMESILO_BASE}/{endpoint}?{urllib.parse.urlencode(full_params)}"
    try:
        with urllib.request.urlopen(url, timeout=30, context=SSL_CTX) as resp:
            body = resp.read().decode("utf-8")
    except Exception as e:  # network/HTTP error
        print(f"❌ HTTP error hitting NameSilo: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(body)
    except ValueError:
        print(f"❌ Invalid JSON from NameSilo: {body[:300]}", file=sys.stderr)
        sys.exit(1)

    reply = data.get("reply")
    if not reply:
        print(f"❌ NameSilo response missing `reply`: {data}", file=sys.stderr)
        sys.exit(1)

    # 300 = success, 301 = partial success (common on availability checks)
    if reply.get("code") not in (300, 301):
        msg = reply.get("detail", f"code {reply.get('code')}")
        print(f"❌ NameSilo API error: {msg}", file=sys.stderr)
        sys.exit(1)

    return reply


def check_availability(base: str, tlds: list) -> list:
    """Check availability for base + each TLD. Returns a sorted list of rows."""
    # NameSilo accepts multiple domains in one call via comma separator.
    domain_list = [f"{base}.{tld}" for tld in tlds]
    reply = ns_request(
        "checkRegisterAvailability",
        {"domains": ",".join(domain_list)},
    )

    def _normalize(section):
        val = reply.get(section)
        if val is None:
            return []
        return val if isinstance(val, list) else [val]

    available = _normalize("available")
    unavailable = _normalize("unavailable")
    invalid = _normalize("invalid")

    results = []
    for d in domain_list:
        hit = next((x for x in available if (x.get("domain") if isinstance(x, dict) else x) == d), None)
        if hit:
            rows = hit if isinstance(hit, dict) else {"domain": hit}
            price = rows.get("price") or 0
            renew = rows.get("renew") or price
            premium = int(rows.get("premium") or 0) > 0
            results.append(
                {
                    "domain": d,
                    "status": "available",
                    "price": float(price),
                    "renew": float(renew),
                    "premium": premium,
                }
            )
            continue

        taken = any(
            (x.get("domain") if isinstance(x, dict) else x) == d for x in unavailable
        )
        if taken:
            results.append({"domain": d, "status": "taken"})
            continue

        bad = any((x.get("domain") if isinstance(x, dict) else x) == d for x in invalid)
        if bad:
            results.append({"domain": d, "status": "invalid"})
            continue

        results.append({"domain": d, "status": "unknown"})

    return results


def print_results(base: str, rows: list):
    """Tidy terminal output."""
    print()
    print(f"  Domain search for *{base}* — NameSilo wholesale prices")
    print("  " + "─" * 56)
    for r in rows:
        status = r["status"]
        if status == "available":
            tag = "⭐️ PREMIUM" if r.get("premium") else "✅"
            price = f"${r['price']:.2f}/yr"
            renew = f"(renew ${r['renew']:.2f})" if abs(r["renew"] - r["price"]) > 0.01 else ""
            print(f"  {tag}  {r['domain']:<30} {price:<14} {renew}")
        elif status == "taken":
            print(f"  ❌  {r['domain']:<30} taken")
        elif status == "invalid":
            print(f"  ⚠️   {r['domain']:<30} invalid TLD")
        else:
            print(f"  ❓  {r['domain']:<30} (unknown)")
    print()

    avail = [r for r in rows if r["status"] == "available" and not r.get("premium")]
    if avail:
        cheapest = min(avail, key=lambda x: x["price"])
        print(f"  Cheapest available: {cheapest['domain']} at ${cheapest['price']:.2f}/yr")
    print()


def main():
    load_env()

    parser = argparse.ArgumentParser(
        description="Check domain availability on NameSilo.",
    )
    parser.add_argument(
        "basename",
        nargs="?",
        help="Base name to check (e.g. 'anshplumbing' → anshplumbing.com, .co, .io, …)",
    )
    parser.add_argument(
        "--tlds",
        default=",".join(DEFAULT_TLDS),
        help=f"Comma-separated TLDs (default: {','.join(DEFAULT_TLDS)})",
    )
    args = parser.parse_args()

    base = args.basename
    if not base:
        try:
            base = input("Domain base name (no TLD): ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(1)

    # Sanitize — alphanumeric + hyphen only, lowercase.
    clean = re.sub(r"[^a-z0-9-]", "", base.lower())
    if len(clean) < 2:
        print("❌ Base name must be at least 2 characters (letters/digits/hyphens).", file=sys.stderr)
        sys.exit(1)
    if clean != base.lower():
        print(f"  (sanitized '{base}' → '{clean}')")

    tlds = [t.strip().lstrip(".").lower() for t in args.tlds.split(",") if t.strip()]
    rows = check_availability(clean, tlds)
    print_results(clean, rows)


if __name__ == "__main__":
    main()
