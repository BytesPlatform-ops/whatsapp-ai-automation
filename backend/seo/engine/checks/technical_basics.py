from __future__ import annotations

from typing import List
from urllib.parse import urlsplit

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


def _canonical_key(url: str) -> str:
    """Normalize a URL for comparison: drop scheme, drop trailing slash, lowercase host."""
    url = (url or "").strip()
    if not url:
        return ""
    parts = urlsplit(url)
    host = parts.netloc.lower()
    path = parts.path or ""
    if path.endswith("/") and path != "/":
        path = path.rstrip("/")
    if path == "/":
        path = ""
    key = host + path
    if parts.query:
        key += "?" + parts.query
    if not key:
        # url with no scheme/host (e.g. a bare path)
        key = url.rstrip("/").lower()
    return key


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]
    is_pixie = (mode == Mode.PIXIE)

    # --- Canonical ---
    canonical = (page.canonical or "").strip()
    if not canonical:
        c = CheckResult(
            id="canonical.missing",
            category=Category.CANONICAL,
            title="Canonical URL",
            description="The page has no canonical URL.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=5,
            passed=False,
            recommendation="Add a canonical link tag pointing to the preferred URL.",
            evidence={},
        )
        if is_pixie and page.url:
            c.fix = {"suggested_canonical": page.url}
        results.append(c)
    else:
        if page.url and _canonical_key(canonical) != _canonical_key(page.url):
            results.append(CheckResult(
                id="canonical.mismatch",
                category=Category.CANONICAL,
                title="Canonical URL",
                description="The canonical URL differs from the page URL.",
                severity=Severity.INFO,
                status=Status.PASS,
                weight=5,
                passed=True,
                recommendation="",
                evidence={"canonical": canonical, "url": page.url},
            ))
        else:
            results.append(CheckResult(
                id="canonical.ok",
                category=Category.CANONICAL,
                title="Canonical URL",
                description="The canonical URL is present and matches the page URL.",
                severity=Severity.INFO,
                status=Status.PASS,
                weight=5,
                passed=True,
                recommendation="",
                evidence={"canonical": canonical},
            ))

    # --- Sitemap ---
    sitemap = (page.sitemap or "").strip()
    if sitemap:
        results.append(CheckResult(
            id="technical.sitemap.present",
            category=Category.TECHNICAL,
            title="Sitemap",
            description="A sitemap reference is present.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=2,
            passed=True,
            recommendation="",
            evidence={"sitemap": sitemap},
        ))
    else:
        results.append(CheckResult(
            id="technical.sitemap.missing",
            category=Category.TECHNICAL,
            title="Sitemap",
            description="No sitemap reference was found.",
            severity=Severity.LOW,
            status=Status.WARN,
            weight=2,
            passed=False,
            recommendation="Publish and reference an XML sitemap.",
            evidence={},
        ))

    # --- Robots ---
    robots = (page.robots or "").strip()
    if robots:
        if "noindex" in robots.lower():
            results.append(CheckResult(
                id="technical.robots.noindex",
                category=Category.TECHNICAL,
                title="Robots directive",
                description="The page is blocked from indexing (noindex).",
                severity=Severity.HIGH,
                status=Status.FAIL,
                weight=6,
                passed=False,
                recommendation="Remove the noindex directive so the page can be indexed.",
                evidence={"robots": robots},
            ))
        else:
            results.append(CheckResult(
                id="technical.robots.ok",
                category=Category.TECHNICAL,
                title="Robots directive",
                description="The robots directive allows indexing.",
                severity=Severity.INFO,
                status=Status.PASS,
                weight=6,
                passed=True,
                recommendation="",
                evidence={"robots": robots},
            ))
    else:
        results.append(CheckResult(
            id="technical.robots.absent",
            category=Category.TECHNICAL,
            title="Robots directive",
            description="No robots directive was found; default indexing assumed.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=1,
            passed=True,
            recommendation="",
            evidence={},
        ))

    # --- Mobile / viewport ---
    viewport = page.meta.get("viewport")
    if not (isinstance(viewport, str) and viewport.strip()):
        mv = page.mobile.get("viewport") if isinstance(page.mobile, dict) else None
        viewport = mv if isinstance(mv, str) else ""
    viewport = (viewport or "").strip()

    if viewport and "width=device-width" in viewport.lower():
        results.append(CheckResult(
            id="mobile.viewport.ok",
            category=Category.MOBILE,
            title="Responsive viewport",
            description="A responsive viewport meta tag is present.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=6,
            passed=True,
            recommendation="",
            evidence={"viewport": viewport},
        ))
    else:
        results.append(CheckResult(
            id="mobile.viewport.missing",
            category=Category.MOBILE,
            title="Responsive viewport",
            description="No responsive viewport meta tag was found.",
            severity=Severity.HIGH,
            status=Status.FAIL,
            weight=6,
            passed=False,
            recommendation="Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.",
            evidence={"viewport": viewport},
        ))

    return results
