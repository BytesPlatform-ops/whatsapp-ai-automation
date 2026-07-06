"""Detect which platform a website is built on, from real HTML + headers.

Read-only signal matching — no login. Drives which connector Pixie offers for
one-tap optimization. Priority reflects real-world share (WordPress first).
"""

from __future__ import annotations

import re

# platform -> list of (signal_label, regex/substring test against html/headers)
_HTML_SIGNALS = {
    "wordpress": ["/wp-content/", "/wp-json/", "wp-includes", 'name="generator" content="WordPress',
                  "yoast", "rank math", "rankmath"],
    "shopify": ["cdn.shopify.com", "Shopify.theme", "shopify-section", "/cdn/shop/", "myshopify.com"],
    "webflow": ["webflow.js", "data-wf-page", "data-wf-site", "assets.website-files.com",
                "assets-global.website-files.com"],
    "wix": ["wixstatic.com", "wix.com", "_wixCssStates", "wix-warmup-data"],
    "squarespace": ["static1.squarespace.com", "squarespace.com", "Static.SQUARESPACE_CONTEXT",
                    "squarespace-cdn.com"],
}
_HEADER_SIGNALS = {
    "shopify": [("x-shopify-stage", ""), ("x-sorting-hat-podid", ""), ("x-shopid", "")],
    "wix": [("x-wix-request-id", ""), ("server", "Pepyaka")],
    "squarespace": [("server", "Squarespace")],
    "wordpress": [("x-powered-by", "WordPress")],
}
# custom / framework fingerprints (checked only if no CMS matched)
_CUSTOM_SIGNALS = {
    "nextjs": ["__NEXT_DATA__", "/_next/static"],
    "react": ['id="root"', "react-dom", "data-reactroot"],
    "laravel": ["laravel_session", "csrf-token"],
}


def detect_platform(html: str, headers: dict | None = None, final_url: str = "") -> dict:
    html_l = (html or "")
    headers = {k.lower(): str(v) for k, v in (headers or {}).items()}
    scores: dict[str, list[str]] = {}

    for platform, sigs in _HTML_SIGNALS.items():
        for s in sigs:
            if s.lower() in html_l.lower():
                scores.setdefault(platform, []).append(f"html:{s}")
    for platform, sigs in _HEADER_SIGNALS.items():
        for hk, hv in sigs:
            got = headers.get(hk, "")
            if got and (hv.lower() in got.lower() if hv else True):
                scores.setdefault(platform, []).append(f"header:{hk}")

    if scores:
        best = max(scores, key=lambda p: len(scores[p]))
        evidence = scores[best]
        confidence = min(1.0, 0.4 + 0.2 * len(evidence))
        return {"detected_platform": best, "confidence": round(confidence, 2), "evidence": evidence}

    # No CMS matched — try to name the custom stack (still "custom" bucket).
    for stack, sigs in _CUSTOM_SIGNALS.items():
        for s in sigs:
            if s.lower() in html_l.lower():
                return {"detected_platform": "custom", "confidence": 0.5,
                        "evidence": [f"custom:{stack}:{s}"], "framework": stack}

    # Static HTML fallback if it's clearly a plain document.
    if re.search(r"<html", html_l, re.I) and "<script" not in html_l.lower():
        return {"detected_platform": "custom", "confidence": 0.3, "evidence": ["static_html"], "framework": "static"}

    return {"detected_platform": "unknown", "confidence": 0.0, "evidence": []}
