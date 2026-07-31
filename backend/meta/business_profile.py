"""Business profile — the marketing-manager onboarding questions.

Pixie behaves like a marketer taking a brief: when it doesn't know the business,
it asks. Answers are stored in pixie_kv (collection ``meta_business_profile``,
tenant-keyed) and feed the Brand Brain, recommendations, ideas, and calendar.

The page is never blocked on this — the UI shows "Pixie needs a little more
context" and the client answers gradually. Every generator degrades gracefully
when answers are missing (starter strategy), so onboarding only sharpens output.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .kv_store import KVDict

_STORE = KVDict("meta_business_profile")

# The marketing brief. `kind`: text | single | multi. Order = ask order.
QUESTIONS: list[dict] = [
    {"id": "sells", "question": "What does your business sell?", "kind": "text"},
    {"id": "ideal_customer", "question": "Who is your ideal customer?", "kind": "text"},
    {"id": "locations", "question": "What locations do you serve?", "kind": "text"},
    {"id": "main_offer", "question": "What is your main offer right now?", "kind": "text"},
    {"id": "differentiator", "question": "What makes you different from competitors?", "kind": "text"},
    {"id": "tone", "question": "What tone should the brand use?", "kind": "single",
     "options": ["Friendly", "Professional", "Playful", "Premium", "Bold", "Warm & local"]},
    {"id": "promote_first", "question": "Which services/products should Pixie promote first?", "kind": "text"},
    {"id": "valuable_customers", "question": "What type of customers are most valuable to you?", "kind": "text"},
    {"id": "audience_problems", "question": "What problems does your audience have?", "kind": "text"},
    {"id": "platforms", "question": "Which platforms matter most?", "kind": "multi",
     "options": ["Facebook", "Instagram", "TikTok", "Google", "LinkedIn"]},
    {"id": "primary_goal", "question": "What do you want most right now?", "kind": "single",
     "options": ["More leads", "More bookings", "More calls", "More sales", "More awareness"]},
    {"id": "upcoming", "question": "Any offers, discounts, events, or seasonal pushes coming up?", "kind": "text"},
]
_IDS = [q["id"] for q in QUESTIONS]
_BY_ID = {q["id"]: q for q in QUESTIONS}


def _answered(answers: dict) -> list[str]:
    out = []
    for qid in _IDS:
        v = answers.get(qid)
        if v is None:
            continue
        if isinstance(v, list) and not v:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        out.append(qid)
    return out


def get_profile(tenant_id: str) -> dict:
    rec = _STORE.get(tenant_id) or {}
    answers = rec.get("answers", {})
    answered = _answered(answers)
    missing = [{"id": q["id"], "question": q["question"], "kind": q["kind"], "options": q.get("options")}
               for q in QUESTIONS if q["id"] not in answered]
    total = len(QUESTIONS)
    return {
        "answers": answers,
        "answered": len(answered),
        "total": total,
        "completion": round(len(answered) / total, 2) if total else 0.0,
        "complete": len(answered) == total,
        "missing": missing,
        "questions": QUESTIONS,
        "updated_at": rec.get("updated_at"),
    }


def update_profile(tenant_id: str, answers: dict) -> dict:
    """Merge in answers (partial allowed). Unknown keys ignored; empty clears."""
    rec = _STORE.get(tenant_id) or {"answers": {}}
    cur = dict(rec.get("answers", {}))
    for qid, val in (answers or {}).items():
        if qid not in _BY_ID:
            continue
        cur[qid] = val
    _STORE.set(tenant_id, {"answers": cur, "updated_at": datetime.now(timezone.utc).isoformat()})
    return get_profile(tenant_id)


def profile_context(tenant_id: str) -> dict:
    """Compact answered-only view for feeding generators (no empties)."""
    answers = (_STORE.get(tenant_id) or {}).get("answers", {})
    return {qid: answers[qid] for qid in _answered(answers)}
