from __future__ import annotations

from ..schemas import (
    Category,
    CheckResult,
    EngineResult,
    Mode,
    SeoPage,
    SeoScore,
    Severity,
    Status,
)
from .checks import run_all_checks
from .normalize import normalize
from .scorer import score_checks

_SEVERITY_RANK = {
    Severity.CRITICAL: 0,
    Severity.HIGH: 1,
    Severity.MEDIUM: 2,
    Severity.LOW: 3,
    Severity.INFO: 4,
}


def _coerce_mode(mode) -> Mode:
    if isinstance(mode, Mode):
        return mode
    if isinstance(mode, str):
        try:
            return Mode(mode.strip().lower())
        except ValueError:
            return Mode.BOTH
    return Mode.BOTH


def analyze(raw: dict, mode: Mode = Mode.BOTH) -> EngineResult:
    mode = _coerce_mode(mode)

    page = normalize(raw)
    checks = run_all_checks(page, mode)
    score = score_checks(checks)

    issues = [c for c in checks if c.status in (Status.FAIL, Status.WARN)]
    issues = sorted(
        issues,
        key=lambda c: (_SEVERITY_RANK.get(c.severity, 99), -c.weight),
    )

    suggestions = [c.recommendation for c in issues if c.recommendation]

    fixes = []
    for c in checks:
        if c.fix:
            entry = dict(c.fix)
            entry["check_id"] = c.id
            fixes.append(entry)

    return EngineResult(
        page=page,
        checks=checks,
        score=score,
        issues=issues,
        suggestions=suggestions,
        fixes=fixes,
    )


__all__ = [
    "analyze",
    "normalize",
    "score_checks",
    "run_all_checks",
    "Mode",
    "Severity",
    "Status",
    "Category",
    "SeoPage",
    "CheckResult",
    "SeoScore",
    "EngineResult",
]
