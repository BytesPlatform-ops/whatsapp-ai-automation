from __future__ import annotations

from typing import Dict


def _score(d: dict) -> float:
    # Accept either a flat {"score": N} or an engine EngineResult.to_dict()
    # whose "score" is a nested SeoScore dict {"score": N, ...}.
    raw = (d or {}).get("score", 0)
    if isinstance(raw, dict):
        raw = raw.get("score", 0)
    try:
        return float(raw or 0)
    except (TypeError, ValueError):
        return 0.0


def compare(base: dict, competitor: dict) -> Dict:
    """Compare two engine EngineResult.to_dict()-shaped dicts. Deterministic.

    Each input is expected to expose a numeric `score`. Returns the score gap
    (base - competitor), the winner, a placeholder keyword gap, and a short
    technical-gap summary string.
    """
    base_score = _score(base)
    competitor_score = _score(competitor)
    gap = base_score - competitor_score

    if gap > 0:
        winner = "base"
        summary = "Base site leads by %.1f points." % abs(gap)
    elif gap < 0:
        winner = "competitor"
        summary = "Competitor leads by %.1f points; close the gap to compete." % abs(gap)
    else:
        winner = "tie"
        summary = "Both sites score evenly."

    return {
        "score_gap": gap,
        "winner": winner,
        "keyword_gap": [],  # placeholder for the keyword-research unit
        "technical_gap_summary": summary,
        "base_score": base_score,
        "competitor_score": competitor_score,
    }
