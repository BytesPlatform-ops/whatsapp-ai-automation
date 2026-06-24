"""Campaigns — compliance-first, dry-run outbound re-engagement of existing customers.

Warm campaigns only (reminders, missed-call callback, win-back, review requests,
offers, payment/renewal reminders, quote follow-up). Every send passes the ordered
compliance gate (gate.py); nothing sends until a human approves AND dry_run is off.
"""

from . import executor, gate, schemas, store

__all__ = ["schemas", "store", "gate", "executor"]
