from __future__ import annotations

from html.parser import HTMLParser
from typing import List

from seo.schemas import Severity

from .models import TechnicalIssue


class _StructureParser(HTMLParser):
    """Collects the minimal structure needed for lightweight HTML validation."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.has_title = False
        self.html_lang = None
        self.h1_count = 0
        self.img_count = 0
        self.img_missing_alt = 0

    def handle_starttag(self, tag, attrs):
        attr = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title":
            self.has_title = True
        elif tag == "html":
            self.html_lang = attr.get("lang")
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "img":
            self.img_count += 1
            if not attr.get("alt", "").strip():
                self.img_missing_alt += 1


def validate_html(html_text: str) -> List[TechnicalIssue]:
    """Lightweight HTML checks via html.parser. Pure, deterministic, stdlib."""
    issues: List[TechnicalIssue] = []
    parser = _StructureParser()
    try:
        parser.feed(html_text or "")
    except Exception:
        # html.parser is permissive; guard anyway so we never raise.
        pass

    if not parser.has_title:
        issues.append(
            TechnicalIssue(
                id="html.title.missing",
                category="technical",
                severity=Severity.HIGH.value,
                title="Missing <title> element",
                description="The document has no <title> element.",
                recommendation="Add a unique, descriptive <title> (50-60 chars) inside <head>.",
                evidence={"has_title": False},
            )
        )

    if not (parser.html_lang and parser.html_lang.strip()):
        issues.append(
            TechnicalIssue(
                id="html.lang.missing",
                category="technical",
                severity=Severity.MEDIUM.value,
                title="Missing lang attribute on <html>",
                description="The <html> element has no lang attribute.",
                recommendation='Set a language, e.g. <html lang="en">, to aid accessibility and indexing.',
                evidence={"html_lang": parser.html_lang},
            )
        )

    if parser.h1_count > 1:
        issues.append(
            TechnicalIssue(
                id="html.h1.multiple",
                category="headings",
                severity=Severity.MEDIUM.value,
                title="Multiple <h1> elements",
                description="Found %d <h1> elements; a page should have a single primary heading." % parser.h1_count,
                recommendation="Keep one <h1> per page and demote the rest to <h2>/<h3>.",
                evidence={"h1_count": parser.h1_count},
            )
        )

    if parser.img_missing_alt > 0:
        issues.append(
            TechnicalIssue(
                id="html.img.alt_missing",
                category="images",
                severity=Severity.LOW.value,
                title="Images missing alt text",
                description="%d of %d <img> elements are missing alt text." % (parser.img_missing_alt, parser.img_count),
                recommendation="Add descriptive alt attributes (or alt=\"\" for decorative images).",
                evidence={"img_missing_alt": parser.img_missing_alt, "img_count": parser.img_count},
            )
        )

    return issues


def validate_jsonld(blocks: list) -> List[TechnicalIssue]:
    """Each JSON-LD block must be a dict with @context and @type."""
    issues: List[TechnicalIssue] = []
    for idx, block in enumerate(blocks or []):
        if not isinstance(block, dict):
            issues.append(
                TechnicalIssue(
                    id="jsonld.malformed",
                    category="schema",
                    severity=Severity.MEDIUM.value,
                    title="Malformed JSON-LD block",
                    description="JSON-LD block #%d is not an object." % idx,
                    recommendation="Each JSON-LD block must be a JSON object with @context and @type.",
                    evidence={"index": idx, "type": type(block).__name__},
                )
            )
            continue
        missing = [k for k in ("@context", "@type") if k not in block]
        if missing:
            issues.append(
                TechnicalIssue(
                    id="jsonld.missing_fields",
                    category="schema",
                    severity=Severity.MEDIUM.value,
                    title="JSON-LD block missing required fields",
                    description="JSON-LD block #%d is missing %s." % (idx, ", ".join(missing)),
                    recommendation="Add %s to the structured-data block." % " and ".join(missing),
                    evidence={"index": idx, "missing": missing},
                )
            )
    return issues


def detect_failed_resources(resources: list) -> List[TechnicalIssue]:
    """Flag resources with status >= 400 or a literal 'failed' status."""
    issues: List[TechnicalIssue] = []
    for res in resources or []:
        if not isinstance(res, dict):
            continue
        status = res.get("status")
        url = res.get("url", "")
        failed = False
        if isinstance(status, str) and status.strip().lower() == "failed":
            failed = True
        else:
            try:
                if int(status) >= 400:
                    failed = True
            except (TypeError, ValueError):
                failed = False
        if failed:
            issues.append(
                TechnicalIssue(
                    id="resource.failed",
                    category="technical",
                    severity=Severity.HIGH.value,
                    title="Failed page resource",
                    description="Resource %s returned status %s." % (url, status),
                    recommendation="Fix or remove the broken resource so it loads (or is no longer referenced).",
                    evidence={"url": url, "status": status},
                )
            )
    return issues
