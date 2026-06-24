from __future__ import annotations

import re
from typing import List

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


def _first_sentence(content: str) -> str:
    content = (content or "").strip()
    if not content:
        return ""
    # split on sentence-ending punctuation
    parts = re.split(r"(?<=[.!?])\s+", content)
    for p in parts:
        p = p.strip()
        if p:
            return p
    return content


def _trim_to(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    # trim on word boundary without exceeding limit
    cut = text[:limit]
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:-")


def _suggested_title(page: SeoPage) -> str:
    base = (page.title or "").strip()
    if not base:
        base = _first_sentence(page.content)
    if not base:
        base = "Untitled Page"
    return _trim_to(base, 57)


def _suggested_description(page: SeoPage) -> str:
    base = (page.meta_description or "").strip()
    if not base:
        base = _first_sentence(page.content)
    if not base:
        base = (page.content or "").strip()
    if not base:
        base = (page.title or "").strip()
    return _trim_to(base, 155)


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]
    # Per spec: fixes only for Mode.PIXIE (Mode.EXTERNAL never generates fixes).
    is_pixie = (mode == Mode.PIXIE)

    title = (page.title or "").strip()
    tlen = len(title)

    # --- Title ---
    if not title:
        c = CheckResult(
            id="meta.title.missing",
            category=Category.META,
            title="Page title",
            description="The page has no <title> tag.",
            severity=Severity.CRITICAL,
            status=Status.FAIL,
            weight=10,
            passed=False,
            recommendation="Add a descriptive <title> between 50 and 60 characters.",
            evidence={"length": 0},
        )
        if is_pixie:
            c.fix = {"suggested_title": _suggested_title(page)}
        results.append(c)
    elif tlen < 30:
        c = CheckResult(
            id="meta.title.too_short",
            category=Category.META,
            title="Page title length",
            description="The page title is shorter than 30 characters.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=10,
            passed=False,
            recommendation="Lengthen the title toward the 50-60 character ideal.",
            evidence={"length": tlen, "title": title},
        )
        if is_pixie:
            c.fix = {"suggested_title": _suggested_title(page)}
        results.append(c)
    elif tlen > 60:
        c = CheckResult(
            id="meta.title.too_long",
            category=Category.META,
            title="Page title length",
            description="The page title is longer than 60 characters.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=10,
            passed=False,
            recommendation="Shorten the title toward the 50-60 character ideal.",
            evidence={"length": tlen, "title": title},
        )
        if is_pixie:
            c.fix = {"suggested_title": _suggested_title(page)}
        results.append(c)
    else:
        ideal = 50 <= tlen <= 60
        results.append(CheckResult(
            id="meta.title.ok",
            category=Category.META,
            title="Page title length",
            description="The page title is within an acceptable length.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=10,
            passed=True,
            recommendation="",
            evidence={"length": tlen, "ideal": ideal},
        ))

    # --- Meta description ---
    desc = (page.meta_description or "").strip()
    dlen = len(desc)
    if not desc:
        c = CheckResult(
            id="meta.description.missing",
            category=Category.META,
            title="Meta description",
            description="The page has no meta description.",
            severity=Severity.HIGH,
            status=Status.FAIL,
            weight=8,
            passed=False,
            recommendation="Add a meta description between 150 and 160 characters.",
            evidence={"length": 0},
        )
        if is_pixie:
            c.fix = {"suggested_description": _suggested_description(page)}
        results.append(c)
    elif dlen < 120:
        c = CheckResult(
            id="meta.description.too_short",
            category=Category.META,
            title="Meta description length",
            description="The meta description is shorter than 120 characters.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=8,
            passed=False,
            recommendation="Expand the meta description toward the 150-160 character ideal.",
            evidence={"length": dlen},
        )
        if is_pixie:
            c.fix = {"suggested_description": _suggested_description(page)}
        results.append(c)
    elif dlen > 160:
        c = CheckResult(
            id="meta.description.too_long",
            category=Category.META,
            title="Meta description length",
            description="The meta description is longer than 160 characters.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=8,
            passed=False,
            recommendation="Shorten the meta description toward the 150-160 character ideal.",
            evidence={"length": dlen},
        )
        if is_pixie:
            c.fix = {"suggested_description": _suggested_description(page)}
        results.append(c)
    else:
        ideal = 150 <= dlen <= 160
        results.append(CheckResult(
            id="meta.description.ok",
            category=Category.META,
            title="Meta description length",
            description="The meta description is within an acceptable length.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=8,
            passed=True,
            recommendation="",
            evidence={"length": dlen, "ideal": ideal},
        ))

    # --- Duplicate / identical title & description ---
    if title and desc and title.strip().lower() == desc.strip().lower():
        results.append(CheckResult(
            id="meta.title_description.identical",
            category=Category.META,
            title="Title and description distinctness",
            description="The page title and meta description are identical.",
            severity=Severity.LOW,
            status=Status.WARN,
            weight=3,
            passed=False,
            recommendation="Differentiate the title and meta description.",
            evidence={"title": title, "description": desc},
        ))
    else:
        results.append(CheckResult(
            id="meta.title_description.distinct",
            category=Category.META,
            title="Title and description distinctness",
            description="The page title and meta description differ.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=3,
            passed=True,
            recommendation="",
            evidence={},
        ))

    # --- Open Graph ---
    og_fields = [
        ("og:title", "Open Graph title"),
        ("og:description", "Open Graph description"),
        ("og:image", "Open Graph image"),
        ("og:url", "Open Graph URL"),
    ]
    for key, label in og_fields:
        present = bool((page.meta.get(key) or "").strip()) if isinstance(page.meta.get(key), str) else bool(page.meta.get(key))
        if present:
            results.append(CheckResult(
                id="social.og.%s" % key.replace(":", "_"),
                category=Category.SOCIAL,
                title=label,
                description="%s is present." % label,
                severity=Severity.INFO,
                status=Status.PASS,
                weight=2,
                passed=True,
                recommendation="",
                evidence={"key": key},
            ))
        else:
            results.append(CheckResult(
                id="social.og.%s" % key.replace(":", "_"),
                category=Category.SOCIAL,
                title=label,
                description="%s is missing." % label,
                severity=Severity.LOW,
                status=Status.WARN,
                weight=2,
                passed=False,
                recommendation="Add a %s meta tag for richer social sharing." % key,
                evidence={"key": key},
            ))

    # --- Twitter ---
    tw_fields = [
        ("twitter:card", "Twitter card"),
        ("twitter:title", "Twitter title"),
        ("twitter:description", "Twitter description"),
        ("twitter:image", "Twitter image"),
    ]
    for key, label in tw_fields:
        present = bool((page.meta.get(key) or "").strip()) if isinstance(page.meta.get(key), str) else bool(page.meta.get(key))
        if present:
            results.append(CheckResult(
                id="social.twitter.%s" % key.replace(":", "_"),
                category=Category.SOCIAL,
                title=label,
                description="%s is present." % label,
                severity=Severity.INFO,
                status=Status.PASS,
                weight=1,
                passed=True,
                recommendation="",
                evidence={"key": key},
            ))
        else:
            results.append(CheckResult(
                id="social.twitter.%s" % key.replace(":", "_"),
                category=Category.SOCIAL,
                title=label,
                description="%s is missing." % label,
                severity=Severity.LOW,
                status=Status.WARN,
                weight=1,
                passed=False,
                recommendation="Add a %s meta tag for Twitter/X sharing." % key,
                evidence={"key": key},
            ))

    return results
