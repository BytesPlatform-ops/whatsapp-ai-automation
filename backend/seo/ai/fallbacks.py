"""Deterministic heuristic generators — used when no model is available.

Pure stdlib (``re`` only). No randomness, no time-dependence: identical input
always yields identical output, so tests are stable.
"""

from __future__ import annotations

import re
from typing import List

_TITLE_MAX = 57
_DESC_MAX = 155
_ALT_MAX = 120

_WS = re.compile(r"\s+")
# A "sentence" ends at . ! ? followed by whitespace/end.
_SENTENCE = re.compile(r"[^.!?]+[.!?]?")


def _collapse(text: str) -> str:
    return _WS.sub(" ", (text or "").strip())


def _first_sentences(content: str, count: int = 1) -> str:
    content = _collapse(content)
    if not content:
        return ""
    sentences = [s.strip() for s in _SENTENCE.findall(content) if s.strip()]
    if not sentences:
        return content
    return " ".join(sentences[:count]).strip()


def _trim_words(text: str, limit: int) -> str:
    """Trim to <= limit chars on a word boundary (no mid-word cuts)."""
    text = _collapse(text)
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Drop the partial last word unless there's only one word.
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,.;:-")


def heuristic_title(title: str = "", content: str = "", brand: str = "") -> str:
    """Prefer existing title; else first sentence of content; else brand.
    Trimmed on a word boundary to <= 57 chars."""
    candidate = _collapse(title)
    if not candidate:
        candidate = _first_sentences(content, 1)
    if not candidate:
        candidate = _collapse(brand)
    return _trim_words(candidate, _TITLE_MAX)


def heuristic_description(description: str = "", content: str = "") -> str:
    """Prefer existing description; else first 1-2 sentences of content.
    Trimmed to <= 155 chars."""
    candidate = _collapse(description)
    if not candidate:
        candidate = _first_sentences(content, 2)
    return _trim_words(candidate, _DESC_MAX)


def heuristic_alt(src: str = "", context: str = "") -> str:
    """Derive readable alt text from the filename in ``src``.

    Strips path/query/fragment/extension and turns ``-``/``_`` into spaces.
    Returns ``"Photo of <name>"``; if nothing usable, ``"Descriptive image"``.
    """
    raw = _collapse(src)
    if raw:
        # Drop query string and fragment.
        raw = raw.split("?", 1)[0].split("#", 1)[0]
        # Take the last path segment.
        name = raw.rstrip("/").rsplit("/", 1)[-1]
        # Strip a trailing extension.
        name = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", name)
        # Normalize separators and noise.
        name = re.sub(r"[-_+.]+", " ", name)
        name = re.sub(r"[^0-9A-Za-z ]+", " ", name)
        name = _collapse(name)
        if name:
            return _trim_words("Photo of {0}".format(name), _ALT_MAX)
    return "Descriptive image"


def heuristic_keyword_usage(content: str = "", target_keywords=None) -> List[str]:
    """For each keyword, report whether it appears in content + a one-line suggestion."""
    keywords = target_keywords or []
    body = _collapse(content).lower()
    out: List[str] = []
    for kw in keywords:
        term = _collapse(str(kw))
        if not term:
            continue
        present = term.lower() in body
        if present:
            out.append(
                "'{0}': found in content. Ensure it also appears in the title, "
                "an H1/H2, and the meta description.".format(term)
            )
        else:
            out.append(
                "'{0}': not found. Add it naturally to a heading and the opening "
                "paragraph without keyword-stuffing.".format(term)
            )
    return out
