from __future__ import annotations

from typing import Dict, List

from seo.engine import analyze
from seo.schemas import Mode, Severity

# The CTA Pixie shows on every external audit. Pixie NEVER edits the
# external site — it only reports findings and invites a migration.
_CTA = {
    "headline": "Migrate to Pixie to auto-fix these issues",
    "action": "migrate_to_pixie",
}

_SEVERITY_BUCKETS = ("critical", "high", "medium", "low")


def _severity_value(sev) -> str:
    if isinstance(sev, Severity):
        return sev.value
    return str(sev).strip().lower()


def build_report(url: str, page_dict: dict) -> dict:
    """Run the SEO engine in EXTERNAL mode and shape a JSON-serializable
    report. Reporting only — no fixes are applied to the remote site.
    """
    result = analyze(page_dict, Mode.EXTERNAL)
    result_dict = result.to_dict()

    grouped: Dict[str, List[dict]] = {b: [] for b in _SEVERITY_BUCKETS}
    for issue in result.issues:
        sev = _severity_value(issue.severity)
        # INFO issues are folded into the low bucket so nothing is lost.
        bucket = sev if sev in grouped else "low"
        grouped[bucket].append(issue.to_dict())

    return {
        "mode": "external",
        "url": url,
        "score": result_dict["score"],
        "issues": grouped,
        "checks": result_dict["checks"],
        "cta": dict(_CTA),
    }
