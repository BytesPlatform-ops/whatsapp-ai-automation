"""The receptionist brain — message → (intent, fields, confidence, sentiment).

Two paths, same output shape, and it NEVER raises (mirrors `seo/ai/client.py`):

  - real LLM (when the model router is in `openai` mode): a strict-JSON extraction
    call. On any failure it falls back to the heuristic.
  - deterministic heuristic (the default in fake/mock mode, $0, no network):
    keyword intent rules + regex field extraction.

`degraded=True` means the heuristic produced the result (no real LLM was used).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .schemas import Intent

_INTENTS = [i.value for i in Intent]

# ── regex helpers ─────────────────────────────────────────────────────────────

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<!\w)(\+?\d[\d\s().-]{6,}\d)(?!\w)")
_AMOUNT = re.compile(r"(?:\$|usd\s*|£|€)\s*([0-9]+(?:\.[0-9]{1,2})?)|\b([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars|usd|pounds|euros)\b", re.I)
_TIME = re.compile(r"\b(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b", re.I)
_ISO_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_WEEKDAY = re.compile(r"\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.I)
_NAME = re.compile(r"\b(?:my name is|i am|i'm|this is|it's)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)", re.I)
_REF = re.compile(r"\b(?:order|reference|ref|booking|ticket|invoice)\s*#?\s*([A-Za-z0-9\-]{3,})\b", re.I)

_NEG_WORDS = {"terrible", "awful", "worst", "angry", "furious", "unhappy", "disappointed",
              "horrible", "unacceptable", "refund", "broken", "ridiculous", "useless", "hate"}
_POS_WORDS = {"great", "thanks", "thank", "awesome", "love", "perfect", "excellent", "amazing", "wonderful"}
_URGENT_WORDS = {"urgent", "asap", "emergency", "immediately", "right now", "right away"}

# intent -> keyword phrases (checked in this priority order)
_INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("unsubscribe", ("unsubscribe", "opt out", "opt-out", "stop messages", "remove me", "stop texting", " stop ")),
    ("payment_link", ("pay online", "payment link", "make a payment", "pay my", "pay the", "send an invoice", "checkout", "pay by card")),
    ("call_routing", ("call me", "call back", "callback", "phone me", "ring me", "give me a call", "have someone call")),
    ("voicemail", ("voicemail", "leave a message", "left you a message", "voice message")),
    ("waitlist", ("waitlist", "wait list", "waiting list", "notify me when", "let me know when", "if anything opens", "fully booked")),
    ("reminder", ("remind me", "set a reminder", "send me a reminder", "reminder for")),
    ("status_lookup", ("status of", "where is my", "track my", "is my order", "is my booking", "update on my", "order number", "check my order")),
    ("reschedule", ("reschedule", "move my appointment", "change my appointment", "change my booking")),
    ("booking", ("book", "appointment", "schedule", "reserve", "reservation", "are you available", "availability", "an opening", "openings", "a slot", "time slot")),
    ("quote", ("quote", "estimate", "how much", "pricing for", "price for", "cost of", "ballpark", "rough cost")),
    ("intake", ("new patient", "new client", "get started", "sign up", "signup", "register", "onboard", "intake")),
    ("follow_up", ("follow up", "follow-up", "check back", "get back to me", "circle back")),
    ("complaint", ("complaint", "complain", "not working", "issue with", "problem with", "unhappy", "disappointed", "want a refund", "need a refund", "get a refund", "demand a refund", "unacceptable", "wrong order")),
    ("escalation", ("speak to a human", "talk to a human", "real person", "speak to someone", "talk to someone", "speak to a manager", "human agent", "representative", "an agent")),
    ("faq", ("what are your", "what's your", "do you offer", "do you have", "where are you", "are you open", "opening hours", "business hours", "how do i", "how does", "what services", "where is your", "your address", "your location", "your hours")),
]


@dataclass
class ClassifierResult:
    intent: str = "fallback"
    confidence: float = 0.3
    sentiment: str = "neutral"
    fields: dict = field(default_factory=dict)
    reply: str = ""
    provider: str = "mock"
    model: str = ""
    degraded: bool = True


def _extract_fields(text: str) -> dict:
    fields: dict = {}
    low = text.lower()
    if (m := _EMAIL.search(text)):
        fields["email"] = m.group(0)
    if (m := _PHONE.search(text)):
        fields["phone"] = m.group(1).strip()
    if (m := _AMOUNT.search(text)):
        fields["amount"] = m.group(1) or m.group(2)
        fields["currency"] = "USD"
    if (m := _ISO_DATE.search(text)):
        fields["date"] = m.group(1)
    elif (m := _WEEKDAY.search(text)):
        fields["date"] = m.group(1).lower()
    if (m := _TIME.search(text)):
        fields["time"] = m.group(1).strip()
    if (m := _NAME.search(text)):
        fields["name"] = m.group(1).strip()
    if (m := _REF.search(text)):
        fields["reference"] = m.group(1)
    if any(w in low for w in _URGENT_WORDS):
        fields["urgency"] = "high"
    return fields


def _sentiment(text: str) -> str:
    low = set(re.findall(r"[a-z']+", text.lower()))
    if low & _NEG_WORDS:
        return "negative"
    if low & _POS_WORDS:
        return "positive"
    return "neutral"


def heuristic_classify(message: str, *, channel: str = "web_chat") -> ClassifierResult:
    text = message or ""
    low = f" {text.lower()} "
    fields = _extract_fields(text)
    sentiment = _sentiment(text)

    if channel == "campaign":
        return ClassifierResult(intent="campaign_reply", confidence=0.6,
                                sentiment=sentiment, fields=fields, degraded=True)
    if channel == "voice" and "voicemail" not in low:
        # a voice channel message with no explicit intent is likely a voicemail
        pass

    for intent, phrases in _INTENT_RULES:
        if any(p in low for p in phrases):
            resolved = "booking" if intent == "reschedule" else intent
            conf = 0.8 if len(intent) > 6 else 0.7
            if intent == "complaint" or sentiment == "negative" and intent == "complaint":
                fields.setdefault("sentiment", "negative")
            return ClassifierResult(intent=resolved, confidence=conf,
                                    sentiment=sentiment, fields=fields, degraded=True)

    # No explicit keyword. A clearly unhappy message → complaint (so angry
    # customers are ticketed even without a keyword).
    if sentiment == "negative":
        return ClassifierResult(intent="complaint", confidence=0.55, sentiment=sentiment,
                                fields={**fields, "sentiment": "negative"}, degraded=True)

    # If they left contact details / interest, treat as a lead;
    # a bare question with no profile match → faq; else general fallback.
    if fields.get("email") or fields.get("phone"):
        return ClassifierResult(intent="lead", confidence=0.5, sentiment=sentiment,
                                fields=fields, degraded=True)
    if "?" in text:
        return ClassifierResult(intent="faq", confidence=0.4, sentiment=sentiment,
                                fields=fields, degraded=True)
    return ClassifierResult(intent="fallback", confidence=0.3, sentiment=sentiment,
                            fields=fields, degraded=True)


# ── LLM path ──────────────────────────────────────────────────────────────────

def _profile_brief(profile: dict) -> str:
    bits = []
    if profile.get("business_name"):
        bits.append(f"Business: {profile['business_name']}")
    if profile.get("industry"):
        bits.append(f"Industry: {profile['industry']}")
    if profile.get("services"):
        bits.append("Services: " + ", ".join(profile["services"][:12]))
    if profile.get("hours"):
        bits.append(f"Hours: {profile['hours']}")
    return "\n".join(bits) or "(no business profile configured)"


def _llm_classify(message: str, *, channel: str, profile: dict) -> ClassifierResult | None:
    """Strict-JSON extraction via the real model. None on any failure."""
    try:
        import asyncio

        from models import ModelRequest, get_router
        from schemas import ModelTier

        router = get_router()
        if router.mode != "openai":
            return None  # fake provider won't honour our JSON schema — use heuristic

        system = (
            "You are the intent+entity extractor for an AI receptionist. "
            "Return ONLY compact JSON with keys: intent, confidence (0-1), sentiment "
            "(positive|neutral|negative), reply (a short helpful customer-facing reply), "
            "fields (object). intent MUST be one of: " + ", ".join(_INTENTS) + ". "
            "fields may include: name, email, phone, company, service, date, time, timezone, "
            "budget, quantity, scope, location, timeline, urgency, preferred_time, reason, "
            "amount, currency, reference, remind_at, question, sentiment, notes. "
            "Only include fields you are confident about. Do not invent business facts.\n\n"
            "Business context:\n" + _profile_brief(profile)
        )
        req = ModelRequest(tier=ModelTier.SMALL, task="reception_extract",
                           system=system, user=message, expects_json=True,
                           context={"channel": channel})
        result = asyncio.run(router.complete(req))
        data = json.loads(result.text)
        intent = str(data.get("intent", "fallback"))
        if intent not in _INTENTS:
            intent = "fallback"
        return ClassifierResult(
            intent=intent,
            confidence=float(data.get("confidence", 0.6) or 0.6),
            sentiment=str(data.get("sentiment", "neutral")),
            fields=data.get("fields") or {},
            reply=str(data.get("reply", "")),
            provider="openai", model=getattr(result, "model", ""), degraded=False,
        )
    except Exception:
        return None


def classify(message: str, *, channel: str = "web_chat",
             profile: dict | None = None) -> ClassifierResult:
    """Classify a message. Tries the real LLM, falls back to the heuristic."""
    profile = profile or {}
    llm = _llm_classify(message, channel=channel, profile=profile)
    if llm is not None:
        # merge any regex-found fields the model missed (belt and suspenders)
        for k, v in _extract_fields(message or "").items():
            llm.fields.setdefault(k, v)
        return llm
    return heuristic_classify(message, channel=channel)
