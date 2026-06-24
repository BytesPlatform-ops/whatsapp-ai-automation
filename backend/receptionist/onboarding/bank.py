"""Read the industry question bank for onboarding.

Lists industries and returns a lean subset of questions per industry (so a
business answers ~10-15 questions, not all 50). The full bank stays the source
of truth; onboarding just selects from it.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_BANK = Path(__file__).resolve().parent.parent / "question_bank" / "ai-receptionist-industry-question-bank.json"

# Canonical industry order (matches the bank build).
INDUSTRY_ORDER = [
    "Beauty Parlour / Salon", "Dental Clinic", "Medical Clinic", "Real Estate Agency",
    "Restaurant / Cafe", "Fitness Gym", "Auto Repair Workshop", "Law Firm",
    "Cleaning Service", "Home Services / Plumbing / Electrical", "Ecommerce Store",
    "Digital Marketing Agency", "School / Academy", "Event Planner", "Travel Agency",
    "SaaS / Software Company", "Insurance Agency", "Accounting / Tax Firm",
    "Hotel / Guest House", "Construction / Contractor Business",
]


@lru_cache(maxsize=1)
def _all() -> list[dict]:
    return json.loads(_BANK.read_text(encoding="utf-8"))


def industries() -> list[str]:
    present = {q["industry"] for q in _all()}
    return [i for i in INDUSTRY_ORDER if i in present]


def questions_for(industry: str, *, limit: int = 12) -> list[dict]:
    """A lean onboarding subset: required questions first, capped at `limit`.
    Returns the fields the form needs."""
    qs = [q for q in _all() if q["industry"] == industry]
    qs.sort(key=lambda q: (not q.get("required", False), q["id"]))  # required first
    chosen = qs[:limit]
    return [
        {
            "id": q["id"],
            "question": q["question"],
            "category": q["category"],
            "expected_answer_type": q["expected_answer_type"],
            "required": q.get("required", False),
            "example_answer": q.get("example_answer", ""),
            "why_it_matters": q.get("why_it_matters", ""),
        }
        for q in chosen
    ]


@lru_cache(maxsize=1)
def _by_id() -> dict[str, dict]:
    return {q["id"]: q for q in _all()}


def question_by_id(question_id: str) -> dict | None:
    return _by_id().get(question_id)


def category_of(question_id: str) -> str | None:
    q = question_by_id(question_id)
    return q["category"] if q else None
