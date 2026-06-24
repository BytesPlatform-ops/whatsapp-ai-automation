"""Assemble + validate the industry question bank from per-industry part files,
then emit the combined JSON and the Markdown doc.

Run: python3 backend/receptionist/question_bank/build_bank.py
Fails loudly (exit 1) if validation does not pass; writes nothing on failure.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PARTS = HERE / "parts"
REPO = HERE.parents[2]  # backend/receptionist/question_bank -> repo root
JSON_OUT = HERE / "ai-receptionist-industry-question-bank.json"
MD_OUT = REPO / "docs" / "ai-receptionist-industry-question-bank.md"

# (prefix, industry name) in canonical order.
INDUSTRIES = [
    ("SALON", "Beauty Parlour / Salon"),
    ("DENTAL", "Dental Clinic"),
    ("MEDICAL", "Medical Clinic"),
    ("REALESTATE", "Real Estate Agency"),
    ("RESTAURANT", "Restaurant / Cafe"),
    ("GYM", "Fitness Gym"),
    ("AUTO", "Auto Repair Workshop"),
    ("LAW", "Law Firm"),
    ("CLEANING", "Cleaning Service"),
    ("HOMESERVICES", "Home Services / Plumbing / Electrical"),
    ("ECOMMERCE", "Ecommerce Store"),
    ("MARKETING", "Digital Marketing Agency"),
    ("SCHOOL", "School / Academy"),
    ("EVENTS", "Event Planner"),
    ("TRAVEL", "Travel Agency"),
    ("SAAS", "SaaS / Software Company"),
    ("INSURANCE", "Insurance Agency"),
    ("ACCOUNTING", "Accounting / Tax Firm"),
    ("HOTEL", "Hotel / Guest House"),
    ("CONSTRUCTION", "Construction / Contractor Business"),
]

CATEGORIES = [
    "Business Identity", "Services / Products", "Pricing / Packages", "Booking / Appointment Rules",
    "Customer Qualification", "FAQs", "Staff / Team / Availability", "Communication Channels",
    "Voice Call Behavior", "WhatsApp / Email / SMS Behavior", "Follow-up Rules",
    "Sales / Upsell Opportunities", "Complaints / Escalation", "Payments / Deposits / Refunds",
    "Industry-Specific Rules", "Compliance / Safety", "Customer Data Collection",
    "AI Tone / Personality", "Reporting / Analytics", "Automation Triggers",
]
ANSWER_TYPES = {"short_text", "long_text", "number", "yes_no", "single_select", "multi_select",
                "date_time", "time_range", "price", "phone", "email", "url", "file_upload",
                "multi_select_or_text"}
USED_FOR = {"ai_prompt", "booking", "faq", "pricing", "lead_qualification", "customer_support",
            "voice_call", "whatsapp", "email", "sms", "campaign", "follow_up", "escalation",
            "analytics", "compliance", "staff_assignment", "payment", "reporting"}
REQUIRED_KEYS = {"id", "industry", "category", "question", "why_it_matters",
                 "expected_answer_type", "required", "used_for", "example_answer", "follow_up_question"}

# Some agents used used_for tokens outside the allowed enum. Map the few
# synonyms to the nearest allowed value; the allowed list has no
# automation/sales/routing concept of its own.
USED_FOR_SYNONYMS = {
    "automation": "follow_up",
    "automation_triggers": "follow_up",
    "automations": "follow_up",
    "routing": "staff_assignment",
    "call_routing": "staff_assignment",
    "sales": "campaign",
    "upsell": "campaign",
    "support": "customer_support",
    "reminders": "follow_up",
    "marketing": "campaign",
}


def normalize_used_for(values) -> list[str]:
    if not isinstance(values, list):
        return ["ai_prompt"]
    out: list[str] = []
    for v in values:
        v = USED_FOR_SYNONYMS.get(v, v)
        if v in USED_FOR and v not in out:
            out.append(v)
    return out or ["ai_prompt"]


errors: list[str] = []
all_q: list[dict] = []
ids: set[str] = set()


def fail(msg: str) -> None:
    errors.append(msg)


for prefix, industry in INDUSTRIES:
    p = PARTS / f"{prefix}.json"
    if not p.exists():
        fail(f"MISSING part file: {p.name}")
        continue
    try:
        rows = json.loads(p.read_text())
    except json.JSONDecodeError as e:
        fail(f"{prefix}: invalid JSON ({e})")
        continue
    if not isinstance(rows, list) or len(rows) != 50:
        fail(f"{prefix}: expected 50 objects, got {len(rows) if isinstance(rows, list) else type(rows).__name__}")
        continue
    for i, q in enumerate(rows, 1):
        loc = f"{prefix}[{i}]"
        if set(q) != REQUIRED_KEYS:
            fail(f"{loc}: keys mismatch (missing {REQUIRED_KEYS - set(q)} / extra {set(q) - REQUIRED_KEYS})")
            continue
        if q["industry"] != industry:
            fail(f"{loc}: industry '{q['industry']}' != '{industry}'")
        if q["category"] not in CATEGORIES:
            fail(f"{loc}: bad category '{q['category']}'")
        if q["expected_answer_type"] not in ANSWER_TYPES:
            fail(f"{loc}: bad expected_answer_type '{q['expected_answer_type']}'")
        if not isinstance(q["required"], bool):
            fail(f"{loc}: required must be bool")
        q["used_for"] = normalize_used_for(q["used_for"])
        uf = q["used_for"]
        if not uf or any(u not in USED_FOR for u in uf):
            fail(f"{loc}: bad used_for {uf}")
        if q["id"] in ids:
            fail(f"{loc}: duplicate id {q['id']}")
        ids.add(q["id"])
        all_q.append(q)

if len(all_q) != 1000:
    fail(f"TOTAL questions = {len(all_q)} (expected 1000)")

if errors:
    print(f"VALIDATION FAILED ({len(errors)} issues):")
    for e in errors[:40]:
        print("  -", e)
    sys.exit(1)

# Write combined JSON
JSON_OUT.write_text(json.dumps(all_q, indent=2, ensure_ascii=False), encoding="utf-8")

# Generate Markdown
MD_OUT.parent.mkdir(parents=True, exist_ok=True)
lines: list[str] = []
lines.append("# AI Receptionist Industry Question Bank\n")
lines.append("## Overview\n")
lines.append("A bank of **1000 onboarding questions** (20 industries × 50) the AI Receptionist "
             "platform uses to learn a business deeply during onboarding. Answers feed the AI "
             "receptionist's system prompt, booking logic, FAQs, lead qualification, follow-ups, "
             "and escalation rules — so the AI behaves like a trained human receptionist for that "
             "specific business. See `ai-receptionist-question-bank-usage.md` for how to use it.\n")
lines.append("## Question Object Schema\n")
lines.append("Each question (in the JSON file) has these fields:\n")
lines.append("- **id** — unique id, `PREFIX-NNN` (e.g. `SALON-001`).\n"
             "- **industry** — the industry this question belongs to.\n"
             "- **category** — one of the 20 onboarding categories (A–T).\n"
             "- **question** — the question shown to the business owner.\n"
             "- **why_it_matters** — why the AI receptionist needs this answer.\n"
             "- **expected_answer_type** — input type (e.g. `multi_select`, `price`, `time_range`).\n"
             "- **required** — whether onboarding requires it.\n"
             "- **used_for** — which AI capabilities consume the answer (e.g. `ai_prompt`, `booking`).\n"
             "- **example_answer** — a realistic sample answer.\n"
             "- **follow_up_question** — an optional conditional follow-up.\n")
lines.append("## Industries Covered\n")
for n, (_, name) in enumerate(INDUSTRIES, 1):
    lines.append(f"{n}. {name}")
lines.append("")

by_id = {q["id"]: q for q in all_q}
for n, (prefix, industry) in enumerate(INDUSTRIES, 1):
    lines.append(f"\n## {n}. {industry}\n")
    rows = [by_id[i] for i in sorted(by_id) if i.startswith(prefix + "-")]
    # group by category in canonical order
    for cat in CATEGORIES:
        cat_rows = [q for q in rows if q["category"] == cat]
        if not cat_rows:
            continue
        lines.append(f"### {cat}\n")
        for q in cat_rows:
            lines.append(f"- **{q['id']}. {q['question']}**")
            lines.append(f"  - Why it matters: {q['why_it_matters']}")
            lines.append(f"  - Expected answer type: `{q['expected_answer_type']}`")
            lines.append(f"  - Used for: {', '.join(q['used_for'])}")
            lines.append(f"  - Required: {'yes' if q['required'] else 'no'}")
            lines.append(f"  - Example answer: {q['example_answer']}")
            lines.append(f"  - Follow-up question: {q['follow_up_question']}")
        lines.append("")

MD_OUT.write_text("\n".join(lines), encoding="utf-8")

# Report
per_industry = {}
for q in all_q:
    per_industry[q["industry"]] = per_industry.get(q["industry"], 0) + 1
print("VALIDATION PASSED")
print(f"  total questions : {len(all_q)}")
print(f"  industries      : {len(per_industry)}")
print(f"  per industry    : {sorted(set(per_industry.values()))}")
print(f"  unique ids      : {len(ids)}")
print(f"  JSON  -> {JSON_OUT.relative_to(REPO)}")
print(f"  MD    -> {MD_OUT.relative_to(REPO)}")
