"""Durable, tenant-scoped stores for the AI Receptionist.

One `RecordStore` per record type, each a module-level singleton over the shared
`persistence.table()` layer (memory | file | supabase). Singletons matter: in
memory mode a fresh `persistence.table()` call returns an EMPTY repo, so we cache
one repo per store (exactly how `approvals`/`activity` do it) — otherwise writes
and reads would land in different in-process repos.

Reads are a tenant scan + Python filter (same as `seo`/`activity`); fine at this
scale. `find_or_create_contact` is the CRM identity resolver every handler uses.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import persistence

from .ids import new_id, now_iso
from .schemas import Contact

# ── table names (SQL migration + tests reference this list) ───────────────────

T_CONVERSATIONS = "receptionist_conversations"
T_MESSAGES = "receptionist_messages"
T_ACTIONS = "receptionist_actions"
T_CONTACTS = "receptionist_contacts"
T_COMPANIES = "receptionist_companies"
T_BOOKINGS = "receptionist_bookings"
T_QUOTES = "receptionist_quotes"
T_CALLBACKS = "receptionist_callbacks"
T_VOICEMAILS = "receptionist_voicemails"
T_WAITLIST = "receptionist_waitlist"
T_PAYMENTS = "receptionist_payments"
T_TICKETS = "receptionist_tickets"
T_ESCALATIONS = "receptionist_escalations"
T_TASKS = "receptionist_tasks"
T_REMINDERS = "receptionist_reminders"
T_OPTOUTS = "receptionist_optouts"
T_BUSINESS_PROFILE = "receptionist_business_profile"
T_KNOWLEDGE = "receptionist_knowledge"
T_CAMPAIGN_REPLIES = "receptionist_campaign_replies"
T_MESSAGE_INDEX = "receptionist_message_index"
T_LOCKS = "receptionist_locks"
T_ACTION_EXECUTIONS = "receptionist_action_executions"
T_CONFIGURATIONS = "receptionist_configurations"
T_CONFIG_VERSIONS = "receptionist_config_versions"
T_CONSENT = "receptionist_consent"
T_SUPPRESSION = "receptionist_suppression"
T_USAGE_COUNTERS = "receptionist_usage_counters"
T_DNC = "receptionist_dnc"
T_KNOWLEDGE_SOURCES = "receptionist_knowledge_sources"
T_INGESTION_JOBS = "receptionist_ingestion_jobs"
T_CAMPAIGN_OPTOUTS = "receptionist_campaign_optouts"
T_CAMPAIGNS = "receptionist_campaigns"
T_CAMPAIGN_TARGETS = "receptionist_campaign_targets"
T_SEND_LOG = "receptionist_send_log"

ALL_TABLES = [
    T_CONVERSATIONS, T_MESSAGES, T_ACTIONS, T_CONTACTS, T_COMPANIES, T_BOOKINGS,
    T_QUOTES, T_CALLBACKS, T_VOICEMAILS, T_WAITLIST, T_PAYMENTS, T_TICKETS,
    T_ESCALATIONS, T_TASKS, T_REMINDERS, T_OPTOUTS, T_BUSINESS_PROFILE,
    T_KNOWLEDGE, T_CAMPAIGN_REPLIES, T_MESSAGE_INDEX, T_LOCKS, T_ACTION_EXECUTIONS,
    T_CONFIGURATIONS, T_CONFIG_VERSIONS, T_CONSENT, T_SUPPRESSION, T_USAGE_COUNTERS,
    T_DNC, T_CAMPAIGN_OPTOUTS, T_CAMPAIGNS, T_CAMPAIGN_TARGETS, T_SEND_LOG,
    T_KNOWLEDGE_SOURCES, T_INGESTION_JOBS,
]


class RecordStore:
    """Row store for one record type. Records are plain dicts with `id`."""

    def __init__(self, name: str) -> None:
        self.name = name
        self._repo = persistence.table(name)

    def put(self, tenant_id: str, record: dict) -> dict:
        """Insert or update a record. Stamps `updated_at`; preserves `created_at`."""
        record.setdefault("id", "")
        record["updated_at"] = now_iso()
        created = record.get("created_at") or now_iso()
        record.setdefault("created_at", created)
        self._repo.upsert(persistence.envelope(record["id"], tenant_id, record, created))
        return record

    def get(self, tenant_id: str, record_id: str) -> Optional[dict]:
        row = self._repo.get(tenant_id, record_id)
        return row["data"] if row else None

    def list(self, tenant_id: str, *, newest_first: bool = True) -> list[dict]:
        data = [r["data"] for r in self._repo.list_by_tenant(tenant_id)]
        return list(reversed(data)) if newest_first else data

    def query(self, tenant_id: str, **eq) -> list[dict]:
        return [d for d in self.list(tenant_id) if all(d.get(k) == v for k, v in eq.items())]

    def delete(self, tenant_id: str, record_id: str) -> bool:
        return self._repo.delete(tenant_id, record_id)

    def count(self, tenant_id: str) -> int:
        return len(self._repo.list_by_tenant(tenant_id))


# ── singletons ────────────────────────────────────────────────────────────────

_STORES: dict[str, RecordStore] = {}


def store(name: str) -> RecordStore:
    s = _STORES.get(name)
    if s is None:
        s = RecordStore(name)
        _STORES[name] = s
    return s


def reset_all() -> None:
    """Drop cached stores so the next access re-reads the backend (memory → clean).
    Used by tests for hermetic isolation between cases."""
    _STORES.clear()


# Named accessors (call these, not `store(...)`, so table names stay in one place).
def conversations() -> RecordStore: return store(T_CONVERSATIONS)
def messages() -> RecordStore: return store(T_MESSAGES)
def actions() -> RecordStore: return store(T_ACTIONS)
def contacts() -> RecordStore: return store(T_CONTACTS)
def companies() -> RecordStore: return store(T_COMPANIES)
def bookings() -> RecordStore: return store(T_BOOKINGS)
def quotes() -> RecordStore: return store(T_QUOTES)
def callbacks() -> RecordStore: return store(T_CALLBACKS)
def voicemails() -> RecordStore: return store(T_VOICEMAILS)
def waitlist() -> RecordStore: return store(T_WAITLIST)
def payments() -> RecordStore: return store(T_PAYMENTS)
def tickets() -> RecordStore: return store(T_TICKETS)
def escalations() -> RecordStore: return store(T_ESCALATIONS)
def tasks() -> RecordStore: return store(T_TASKS)
def reminders() -> RecordStore: return store(T_REMINDERS)
def optouts() -> RecordStore: return store(T_OPTOUTS)
def business_profiles() -> RecordStore: return store(T_BUSINESS_PROFILE)
def knowledge() -> RecordStore: return store(T_KNOWLEDGE)
def campaign_replies() -> RecordStore: return store(T_CAMPAIGN_REPLIES)


# ── CRM identity resolution ───────────────────────────────────────────────────

def _norm(v: Optional[str]) -> str:
    return (v or "").strip().lower()


def find_contact(tenant_id: str, *, email: Optional[str] = None,
                 phone: Optional[str] = None) -> Optional[dict]:
    """Find a contact by email (preferred) or phone. Tenant-scoped."""
    if not email and not phone:
        return None
    e, p = _norm(email), _norm(phone)
    for c in contacts().list(tenant_id):
        if e and _norm(c.get("email")) == e:
            return c
        if p and _norm(c.get("phone")) == p:
            return c
    return None


def find_or_create_contact(
    tenant_id: str,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    company: Optional[str] = None,
    source: str = "manual",
    intent: str = "unknown",
    service_interest: str = "",
    budget: str = "",
    urgency: str = "normal",
    notes: str = "",
    last_message_summary: str = "",
    consent: Optional[bool] = None,
    activity_note: str = "",
) -> dict:
    """Create-or-update a contact by (tenant, email|phone). Non-empty values win;
    always refreshes last_contact_at and appends an activity entry when given."""
    existing = find_contact(tenant_id, email=email, phone=phone)
    now = now_iso()
    if existing is not None:
        for key, val in (("name", name), ("email", email), ("phone", phone),
                         ("company", company), ("service_interest", service_interest),
                         ("budget", budget), ("notes", notes),
                         ("last_message_summary", last_message_summary)):
            if val:
                existing[key] = val
        if intent and intent != "unknown":
            existing["intent"] = intent
        if urgency:
            existing["urgency"] = urgency
        if consent is not None:
            existing["consent"] = consent
        existing["source"] = existing.get("source") or source
        existing["last_contact_at"] = now
        if activity_note:
            existing.setdefault("activity", []).append({"at": now, "note": activity_note})
        return contacts().put(tenant_id, existing)

    contact = Contact(
        tenant_id=tenant_id, name=name, email=email, phone=phone, company=company,
        source=source, intent=intent, service_interest=service_interest, budget=budget,
        urgency=urgency, notes=notes, last_message_summary=last_message_summary,
        consent=bool(consent), last_contact_at=now,
        activity=[{"at": now, "note": activity_note}] if activity_note else [],
    ).model_dump()
    return contacts().put(tenant_id, contact)


def add_contact_activity(tenant_id: str, contact_id: Optional[str], note: str) -> None:
    if not contact_id:
        return
    c = contacts().get(tenant_id, contact_id)
    if c is None:
        return
    c.setdefault("activity", []).append({"at": now_iso(), "note": note})
    contacts().put(tenant_id, c)


# Named accessors for new stores
def message_index() -> RecordStore: return store(T_MESSAGE_INDEX)
def locks() -> RecordStore: return store(T_LOCKS)
def action_executions() -> RecordStore: return store(T_ACTION_EXECUTIONS)
def configurations() -> RecordStore: return store(T_CONFIGURATIONS)
def config_versions() -> RecordStore: return store(T_CONFIG_VERSIONS)
def consent() -> RecordStore: return store(T_CONSENT)
def suppression() -> RecordStore: return store(T_SUPPRESSION)
def usage_counters() -> RecordStore: return store(T_USAGE_COUNTERS)
def knowledge_sources() -> RecordStore: return store(T_KNOWLEDGE_SOURCES)
def ingestion_jobs() -> RecordStore: return store(T_INGESTION_JOBS)


# ── durable per-conversation lock ─────────────────────────────────────────────

def _lock_record_id(tenant_id: str, conversation_id: str) -> str:
    """Composite key for a lock record: tenant+conv pair."""
    return f"{tenant_id}::{conversation_id}"


def acquire_lock(tenant_id: str, conversation_id: str, owner: str = "",
                 ttl_seconds: Optional[int] = None) -> bool:
    """Try to acquire a durable lock for this conversation.

    Returns True if the lock was acquired (or was already owned by `owner`).
    Returns False if another active (non-expired) lock exists.
    Stale (expired) locks are reclaimed.

    NOTE: this is best-effort serialization: there is no atomic compare-and-swap
    at the persistence layer, so a tiny race window exists under concurrent
    access. It significantly reduces duplicates but is not a strict mutex.
    """
    ttl = ttl_seconds if ttl_seconds is not None else int(
        os.environ.get("AI_RECEPTIONIST_LOCK_TTL_SECONDS", "30")
    )
    record_id = _lock_record_id(tenant_id, conversation_id)
    existing = locks().get(tenant_id, record_id)
    now = now_iso()

    if existing is not None:
        # Check whether the existing lock is still active
        expires_at = existing.get("expires_at", "")
        if expires_at and expires_at > now:
            # Active lock owned by someone else → cannot acquire
            if owner and existing.get("owner") == owner:
                return True  # same owner — idempotent
            return False
        # Stale/expired lock — fall through to overwrite

    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    expires_at = (_dt.now(_tz.utc) + _td(seconds=ttl)).isoformat(timespec="seconds")
    lock_rec = {
        "id": record_id,
        "tenant_id": tenant_id,
        "conversation_id": conversation_id,
        "owner": owner or new_id("lock"),
        "expires_at": expires_at,
        "created_at": now,
    }
    locks().put(tenant_id, lock_rec)
    return True


def release_lock(tenant_id: str, conversation_id: str) -> None:
    """Release a lock by clearing its expiry (marks it expired)."""
    record_id = _lock_record_id(tenant_id, conversation_id)
    existing = locks().get(tenant_id, record_id)
    if existing is not None:
        # Set expires_at to epoch so it's immediately stale
        existing["expires_at"] = "1970-01-01T00:00:00+00:00"
        locks().put(tenant_id, existing)
