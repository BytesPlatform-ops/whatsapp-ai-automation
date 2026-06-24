"""Deterministic on-page keyword / content analysis. Pure stdlib."""

from __future__ import annotations

import re
from typing import Dict, List

_WORD_RE = re.compile(r"[A-Za-z0-9']+")

THIN_CONTENT_WORDS = 300
OVERUSE_DENSITY_PCT = 3.0
FIRST_N_WORDS = 100


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in _WORD_RE.findall(text or "")]


def _count_phrase(tokens: List[str], phrase_tokens: List[str]) -> int:
    """Count non-overlapping occurrences of a (possibly multi-word) phrase."""
    n = len(phrase_tokens)
    if n == 0:
        return 0
    if n == 1:
        return tokens.count(phrase_tokens[0])
    count = 0
    i = 0
    limit = len(tokens) - n
    while i <= limit:
        if tokens[i : i + n] == phrase_tokens:
            count += 1
            i += n  # non-overlapping
        else:
            i += 1
    return count


def analyze_content_keywords(content: str, target_keywords: list) -> Dict[str, object]:
    """Analyze content against target keywords. Deterministic; never raises."""
    content = content or ""
    targets = [str(k).strip() for k in (target_keywords or []) if str(k).strip()]

    tokens = _tokenize(content)
    word_count = len(tokens)
    first_window = set(tokens[:FIRST_N_WORDS])

    keywords: Dict[str, Dict[str, float]] = {}
    overuse: List[str] = []
    missing: List[str] = []
    placement: List[str] = []

    for kw in targets:
        kw_tokens = _tokenize(kw)
        count = _count_phrase(tokens, kw_tokens)
        density = round((count / word_count * 100.0), 4) if word_count else 0.0
        keywords[kw] = {"count": count, "density": density}

        if count == 0:
            missing.append(kw)
            placement.append(
                "Add '{0}' to the page — it is a target keyword but does not appear in the content.".format(kw)
            )
            continue

        if density > OVERUSE_DENSITY_PCT:
            overuse.append(kw)
            placement.append(
                "Reduce usage of '{0}' (density {1:.2f}% > {2:.1f}%) to avoid keyword stuffing.".format(
                    kw, density, OVERUSE_DENSITY_PCT
                )
            )

        # Placement hint: is the keyword present early in the body?
        in_first = all(t in first_window for t in kw_tokens) if kw_tokens else False
        if not in_first:
            placement.append(
                "Put '{0}' in the H1/title and within the first {1} words.".format(kw, FIRST_N_WORDS)
            )

    thin = word_count < THIN_CONTENT_WORDS
    thin_message = (
        "Thin content: {0} words (< {1}). Expand to improve topical depth and ranking.".format(
            word_count, THIN_CONTENT_WORDS
        )
        if thin
        else "Content length OK: {0} words.".format(word_count)
    )

    return {
        "word_count": word_count,
        "thin_content": {"thin": thin, "message": thin_message},
        "keywords": keywords,
        "overuse": overuse,
        "missing": missing,
        "placement": placement,
    }
