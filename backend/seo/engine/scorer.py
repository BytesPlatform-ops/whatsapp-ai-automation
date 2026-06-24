from __future__ import annotations

from ..schemas import Category, CheckResult, SeoScore, Status


def score_checks(checks: list) -> SeoScore:
    """Deterministic weighted score over applicable checks. Pure function."""
    applicable = [c for c in checks if c.status != Status.NOT_APPLICABLE]

    earned = sum(c.weight for c in applicable if c.passed is True)
    possible = sum(c.weight for c in applicable)

    if possible == 0:
        score = 100
    else:
        score = round(100 * earned / possible)

    passed_count = sum(1 for c in applicable if c.passed is True)
    failed_count = sum(1 for c in applicable if c.passed is not True)
    applicable_count = len(applicable)

    # per-category aggregation
    by_category = {}
    for cat in Category:
        cat_checks = [c for c in applicable if c.category == cat]
        if not cat_checks:
            continue
        cat_earned = sum(c.weight for c in cat_checks if c.passed is True)
        cat_possible = sum(c.weight for c in cat_checks)
        cat_score = 100 if cat_possible == 0 else round(100 * cat_earned / cat_possible)
        by_category[cat.value] = {
            "score": cat_score,
            "passed": sum(1 for c in cat_checks if c.passed is True),
            "total": len(cat_checks),
        }

    return SeoScore(
        score=score,
        max_score=100,
        passed_count=passed_count,
        failed_count=failed_count,
        applicable_count=applicable_count,
        by_category=by_category,
    )
