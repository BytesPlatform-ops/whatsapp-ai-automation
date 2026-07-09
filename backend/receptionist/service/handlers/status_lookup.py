"""Status-lookup handler.

Answers "what's the status of my …?" WITHOUT creating a record. Resolves the
caller's identity from the supplied email / phone / reference, then scans ONLY
this tenant's bookings, quotes, payments and tickets for rows that match that
identity (case-insensitive on email/phone/id). Returns a minimal, safe summary
of the caller's OWN records only — never lists anyone else's data. No identity →
ask for one; identity but nothing found → say so.
"""

from __future__ import annotations

from .. import stores
from .base import HandlerContext, HandlerResult, register


def _norm(v) -> str:
    return str(v or "").strip().lower()


def _matches(record: dict, email: str, phone: str, ref: str) -> bool:
    """True only if the record belongs to the supplied identity."""
    if email and _norm(record.get("email")) == email:
        return True
    if phone and _norm(record.get("phone")) == phone:
        return True
    if ref and _norm(record.get("id")) == ref:
        return True
    return False


@register("status_lookup")
def handle_status_lookup(ctx: HandlerContext) -> HandlerResult:
    email = _norm(ctx.f("email"))
    phone = _norm(ctx.f("phone"))
    ref = _norm(ctx.f("reference") or ctx.f("order_ref"))
    who = ctx.f("name") or "there"

    if not (email or phone or ref):
        reply = (f"Happy to check that for you, {who}. Could you share the email, "
                 "phone number, or reference number on the request?")
        return HandlerResult(
            reply=reply, action="status_lookup", status="noop",
            record_type="lookup", record_id="",
            detail="no identity supplied",
        )

    summaries: list[str] = []

    for record in stores.bookings().list(ctx.tenant_id):
        if _matches(record, email, phone, ref):
            when = record.get("date") or "your requested date"
            summaries.append(
                f"Your booking on {when} is {record.get('status', 'pending')}.")

    for record in stores.quotes().list(ctx.tenant_id):
        if _matches(record, email, phone, ref):
            svc = record.get("service") or "your request"
            summaries.append(
                f"Your quote for {svc} is {record.get('status', 'new')}.")

    for record in stores.payments().list(ctx.tenant_id):
        if _matches(record, email, phone, ref):
            amt = record.get("amount")
            money = f"{amt} {record.get('currency', 'USD')}" if amt else "your payment"
            summaries.append(
                f"Your payment of {money} is {record.get('status', 'pending')}.")

    for record in stores.tickets().list(ctx.tenant_id):
        if _matches(record, email, phone, ref):
            subj = record.get("subject") or "your support request"
            summaries.append(
                f"Your support ticket \"{subj}\" is {record.get('status', 'open')}.")

    if not summaries:
        reply = (f"I couldn't find anything under those details, {who}. Please "
                 "double-check the email, phone, or reference number.")
        return HandlerResult(
            reply=reply, action="status_lookup", status="noop",
            record_type="lookup", record_id="",
            detail="identity supplied, no match",
        )

    reply = f"Here's what I found, {who}: " + " ".join(summaries)
    return HandlerResult(
        reply=reply, action="status_lookup", status="executed",
        record_type="lookup", record_id="",
        detail=f"matched={len(summaries)}",
    )
