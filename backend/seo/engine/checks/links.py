from __future__ import annotations

import re
from typing import List
from urllib.parse import urlsplit

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


def _slugify(path: str) -> str:
    path = (path or "").strip()
    # work on last path segment for slug suggestion, but keep leading slash structure simple
    # replace %20 and spaces with hyphen, underscores with hyphen, lowercase, strip junk
    s = path
    s = s.replace("%20", "-").replace(" ", "-")
    s = s.replace("_", "-")
    s = s.lower()
    s = re.sub(r"[^a-z0-9/\-]", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    s = re.sub(r"/{2,}", "/", s)
    # trim hyphens around slashes and ends
    s = re.sub(r"-?/-?", "/", s)
    s = s.strip("-")
    return s


def _host(url: str) -> str:
    try:
        return urlsplit(url).netloc.lower()
    except (ValueError, AttributeError):
        return ""


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]
    is_pixie = (mode == Mode.PIXIE)

    parts = urlsplit(page.url) if page.url else None
    path = parts.path if parts else ""
    query = parts.query if parts else ""

    # --- slug optimization ---
    violations = []
    if path and path != "/":
        slug = path
        if any(c.isupper() for c in slug):
            violations.append("uppercase")
        if "_" in slug:
            violations.append("underscores")
        if " " in slug or "%20" in slug:
            violations.append("spaces")
        if len(path) > 75:
            violations.append("too_long")
        if query:
            violations.append("query_heavy")

    if violations:
        c = CheckResult(
            id="links.slug.suboptimal",
            category=Category.LINKS,
            title="URL slug",
            description="The URL slug has optimization issues.",
            severity=Severity.LOW,
            status=Status.WARN,
            weight=2,
            passed=False,
            recommendation="Use a lowercase, hyphen-separated, concise URL slug without query strings.",
            evidence={"path": path, "violations": violations},
        )
        if is_pixie:
            c.fix = {"suggested_slug": _slugify(path)}
        results.append(c)
    else:
        results.append(CheckResult(
            id="links.slug.ok",
            category=Category.LINKS,
            title="URL slug",
            description="The URL slug is well-formed.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=2,
            passed=True,
            recommendation="",
            evidence={"path": path},
        ))

    # --- internal vs external counts ---
    page_host = _host(page.url)
    internal = 0
    external = 0
    for link in page.links:
        if not isinstance(link, dict):
            continue
        flag = link.get("internal")
        if isinstance(flag, bool):
            if flag:
                internal += 1
            else:
                external += 1
            continue
        href = (link.get("href") or "").strip()
        if not href:
            continue
        if href.startswith("/") or href.startswith("#") or href.startswith("?"):
            internal += 1
            continue
        h = _host(href)
        if not h or (page_host and h == page_host):
            internal += 1
        else:
            external += 1

    results.append(CheckResult(
        id="links.counts",
        category=Category.LINKS,
        title="Link distribution",
        description="Counts of internal and external links.",
        severity=Severity.INFO,
        status=Status.PASS,
        weight=1,
        passed=True,
        recommendation="",
        evidence={"internal": internal, "external": external, "total": internal + external},
    ))

    return results
