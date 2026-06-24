from __future__ import annotations

from typing import List

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


REQUIRED_FIELDS = {
    "LocalBusiness": ["name", "address", "telephone"],
    "Restaurant": ["name", "address", "servesCuisine"],
    "Product": ["name", "offers"],
    "Article": ["headline", "author", "datePublished"],
    "Organization": ["name", "url"],
    "FAQPage": ["mainEntity"],
    "BreadcrumbList": ["itemListElement"],
}


def _type_of(block) -> str:
    if not isinstance(block, dict):
        return ""
    t = block.get("@type")
    if isinstance(t, list):
        t = t[0] if t else ""
    return str(t).strip() if t is not None else ""


def _missing_required(block: dict, required) -> list:
    missing = []
    for field_name in required:
        val = block.get(field_name)
        if val is None or (isinstance(val, str) and not val.strip()) or (isinstance(val, (list, dict)) and len(val) == 0):
            missing.append(field_name)
    return missing


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]

    blocks = [b for b in page.schema if isinstance(b, dict)]

    if not blocks:
        results.append(CheckResult(
            id="schema.missing",
            category=Category.SCHEMA,
            title="Structured data",
            description="The page has no JSON-LD structured data.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=5,
            passed=False,
            recommendation="Add JSON-LD structured data (schema.org) describing the page.",
            evidence={},
        ))
        return results

    for idx, block in enumerate(blocks):
        block_type = _type_of(block)
        if not block_type:
            results.append(CheckResult(
                id="schema.block.%d.untyped" % idx,
                category=Category.SCHEMA,
                title="Structured data block",
                description="A JSON-LD block has no @type.",
                severity=Severity.INFO,
                status=Status.PASS,
                weight=3,
                passed=True,
                recommendation="",
                evidence={"index": idx},
            ))
            continue

        if block_type in REQUIRED_FIELDS:
            missing = _missing_required(block, REQUIRED_FIELDS[block_type])
            if missing:
                results.append(CheckResult(
                    id="schema.block.%d.%s.missing_fields" % (idx, block_type.lower()),
                    category=Category.SCHEMA,
                    title="%s structured data" % block_type,
                    description="The %s structured data block is missing required fields." % block_type,
                    severity=Severity.LOW,
                    status=Status.WARN,
                    weight=3,
                    passed=False,
                    recommendation="Add the missing %s fields: %s." % (block_type, ", ".join(missing)),
                    evidence={"type": block_type, "missing": missing, "index": idx},
                ))
            else:
                results.append(CheckResult(
                    id="schema.block.%d.%s.ok" % (idx, block_type.lower()),
                    category=Category.SCHEMA,
                    title="%s structured data" % block_type,
                    description="The %s structured data block has all required fields." % block_type,
                    severity=Severity.INFO,
                    status=Status.PASS,
                    weight=3,
                    passed=True,
                    recommendation="",
                    evidence={"type": block_type, "index": idx},
                ))
        else:
            results.append(CheckResult(
                id="schema.block.%d.unrecognized" % idx,
                category=Category.SCHEMA,
                title="Structured data block",
                description="The structured data @type '%s' is not validated by this engine." % block_type,
                severity=Severity.INFO,
                status=Status.PASS,
                weight=3,
                passed=True,
                recommendation="",
                evidence={"type": block_type, "index": idx},
            ))

    return results
