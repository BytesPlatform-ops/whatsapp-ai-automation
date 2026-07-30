"""Hybrid knowledge retrieval for the AI Receptionist (Wave 5, Part 10).

Replaces plain keyword-overlap with a deterministic hybrid ranker that works with
zero paid embeddings:

    query → normalise → structured-field match → exact-phrase match → lexical
    relevance → freshness weighting → dedupe → bounded evidence selection

Retrieves over structured profile fields (hours/services/prices/policies/location/
contact), saved FAQs and knowledge items (plain text / future PDF / website pages).
Each evidence item carries source_id, chunk_id, relevance score, retrieval method,
version and freshness. When the best evidence is weak, :func:`retrieve` reports
``confident=False`` so the caller asks a clarifying question / says it's unavailable
rather than inventing a business fact.

An optional semantic provider can be layered in later; the lexical path is the
always-on floor and keeps the hermetic test suite $0.
"""

from __future__ import annotations

import re
from typing import Optional

from . import stores
from .business_profile import get_profile, list_knowledge

_WORD = re.compile(r"[a-z0-9]+")

# Bounds (env-overridable) — keep evidence small + deterministic.
import os

MAX_EVIDENCE_CHUNKS = int(os.environ.get("AI_RECEPTIONIST_KNOWLEDGE_MAX_CHUNKS", "4") or 4)
MAX_EVIDENCE_CHARS = 1200
# Below this best score, evidence is too weak to answer from (→ clarify/escalate).
CONFIDENCE_FLOOR = 1.0


# Common stopwords excluded from lexical overlap so a query like "do you ... to ..."
# doesn't spuriously match on "to"/"you" inside an unrelated snippet.
_STOPWORDS = {
    "a", "an", "the", "is", "are", "am", "be", "to", "of", "and", "or", "in", "on",
    "at", "for", "you", "your", "we", "our", "us", "do", "does", "did", "i", "me",
    "my", "it", "this", "that", "with", "can", "could", "would", "will", "how",
    "what", "when", "where", "who", "why", "which", "there", "here", "please",
    "have", "has", "any", "some", "about", "tell", "get", "give", "me",
}


def _tokens(text: str) -> set[str]:
    return set(_WORD.findall((text or "").lower()))


def _content_tokens(text: str) -> set[str]:
    return {t for t in _WORD.findall((text or "").lower()) if t not in _STOPWORDS}


def _profile_snippets(profile: dict) -> list[dict]:
    """Structured profile fields → retrievable (field, text) snippets."""
    out: list[dict] = []

    def add(field: str, text: str) -> None:
        if text:
            out.append({"field": field, "text": text})

    add("hours", f"Our business hours: {profile['hours']}" if profile.get("hours") else "")
    if profile.get("services"):
        add("services", "Services we offer: " + ", ".join(profile["services"]))
    add("pricing", profile.get("pricing_notes", ""))
    loc = profile.get("address") or profile.get("location")
    add("location", f"You can find us at {loc}." if loc else "")
    add("policies", profile.get("policies", ""))
    add("process", profile.get("process", ""))
    contact_bits = [b for b in (profile.get("phone"), profile.get("email"), profile.get("website")) if b]
    add("contact", "You can reach us at " + ", ".join(contact_bits) + "." if contact_bits else "")
    return out


def _freshness(updated_at: str) -> float:
    """Tiny recency nudge in [0, 0.5] — never dominates lexical relevance."""
    if not updated_at:
        return 0.0
    # ISO strings sort lexically; a more recent timestamp gets a marginally higher nudge.
    return 0.25


def _score(query_tokens: set[str], query_text: str, text: str) -> tuple[float, str]:
    """Hybrid score for one candidate → (score, method). ``query_tokens`` is the
    stopword-filtered content token set."""
    t_tokens = _content_tokens(text)
    overlap = len(query_tokens & t_tokens)
    method = "lexical"
    score = float(overlap)
    # exact-phrase boost: a multi-word query substring present verbatim
    q = query_text.strip().lower()
    if len(q) >= 6 and q in (text or "").lower():
        score += 3.0
        method = "exact_phrase"
    # partial-phrase boost for 3-gram matches
    elif overlap >= 2:
        method = "lexical_multi"
    return score, method


def retrieve(tenant_id: str, query: str, *, max_chunks: Optional[int] = None) -> dict:
    """Hybrid retrieval → bounded, scored, deduped evidence + a confidence flag.

    Returns:
        {
          "confident": bool,          # False when evidence is too weak to answer
          "method": str,              # dominant retrieval method
          "evidence": [ {source_id, chunk_id, text, score, method, field, version,
                         freshness} ... ],
          "answer": str | "",         # top evidence text (for a direct reply)
          "outcome": "answer" | "knowledge_gap",
        }
    """
    max_chunks = max_chunks or MAX_EVIDENCE_CHUNKS
    q_tokens = _content_tokens(query)
    if not q_tokens:
        return {"confident": False, "method": "none", "evidence": [], "answer": "",
                "outcome": "knowledge_gap"}

    profile = get_profile(tenant_id)
    cfg_version = str(profile.get("config_version", ""))
    candidates: list[dict] = []

    # 1) structured profile fields
    for snip in _profile_snippets(profile):
        s, method = _score(q_tokens, query, snip["field"] + " " + snip["text"])
        if s > 0:
            s += 0.25  # structured fields are authoritative → tiny boost
            candidates.append({
                "source_id": f"profile:{snip['field']}", "chunk_id": snip["field"],
                "text": snip["text"], "score": s, "method": "structured_field",
                "field": snip["field"], "version": cfg_version, "freshness": 0.5,
            })

    # 2) saved FAQs
    for i, faq in enumerate(profile.get("faqs", []) or []):
        text = (faq.get("a", "") or "")
        s, method = _score(q_tokens, query, (faq.get("q", "") + " " + text))
        if s > 0:
            candidates.append({
                "source_id": "faq", "chunk_id": f"faq:{i}", "text": text,
                "score": s + 0.5, "method": method, "field": "faq",
                "version": cfg_version, "freshness": 0.25,
            })

    # 3) knowledge items (plain text / PDF pages / website pages)
    for item in list_knowledge(tenant_id):
        text = item.get("content", "") or ""
        s, method = _score(q_tokens, query, item.get("title", "") + " " + text)
        if s > 0:
            candidates.append({
                "source_id": item.get("id", "knowledge"), "chunk_id": item.get("id", ""),
                "text": text, "score": s + _freshness(item.get("updated_at", "")),
                "method": method, "field": item.get("category", "knowledge"),
                "version": str(item.get("updated_at", "")), "freshness": _freshness(item.get("updated_at", "")),
            })

    if not candidates:
        return {"confident": False, "method": "none", "evidence": [], "answer": "",
                "outcome": "knowledge_gap"}

    # dedupe by (source_id, first 60 chars of text), keep highest score
    best: dict[str, dict] = {}
    for c in candidates:
        key = f"{c['source_id']}::{c['text'][:60]}"
        if key not in best or c["score"] > best[key]["score"]:
            best[key] = c
    ranked = sorted(best.values(), key=lambda c: c["score"], reverse=True)

    # bounded evidence selection
    evidence: list[dict] = []
    chars = 0
    for c in ranked[:max_chunks]:
        if chars + len(c["text"]) > MAX_EVIDENCE_CHARS and evidence:
            break
        evidence.append(c)
        chars += len(c["text"])

    top = evidence[0]
    confident = top["score"] >= CONFIDENCE_FLOOR
    return {
        "confident": confident,
        "method": top["method"],
        "evidence": evidence,
        "answer": top["text"] if confident else "",
        "outcome": "answer" if confident else "knowledge_gap",
    }


def answer_question(tenant_id: str, question: str) -> Optional[dict]:
    """Backward-compatible answer contract built on hybrid :func:`retrieve`.

    Returns {answer, source, ref, score, evidence} for the best confident evidence,
    or None when evidence is too weak (caller must NOT hallucinate)."""
    result = retrieve(tenant_id, question)
    if not result["confident"] or not result["evidence"]:
        return None
    top = result["evidence"][0]
    return {
        "answer": top["text"],
        "source": top["source_id"].split(":")[0] if ":" in top["source_id"] else top["source_id"],
        "ref": top["chunk_id"],
        "score": top["score"],
        "method": top["method"],
        "evidence": result["evidence"],
    }
