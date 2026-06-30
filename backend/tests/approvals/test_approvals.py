"""Approvals + activity tests. $0, no network."""
from __future__ import annotations

import approvals.router as ar
import activity.router as actr
from approvals.router import _Store, create_approval, list_approvals, approve, reject, ResolveBody
from activity.router import get_activity_store


def _fresh():
    ar._store = _Store()
    actr._store = actr._Store()


def test_create_approval_is_pending_and_logged():
    _fresh()
    item = create_approval("t1", "website", "Publish site", "do_this")
    assert item.status == "pending"
    assert list_approvals(tenant_id="t1")[0].id == item.id
    assert get_activity_store().recent("t1")[0].type == "approval_created"


def test_approve_executes_and_logs():
    _fresh()
    item = create_approval("t2", "marketing", "Send campaign", "approve")
    out = approve(item.id, ResolveBody(tenant_id="t2"))
    assert out.status == "executed"
    assert get_activity_store().recent("t2")[0].type == "approval_completed"


def test_reject_sets_rejected():
    _fresh()
    item = create_approval("t3", "content", "Post reel", "approve")
    out = reject(item.id, ResolveBody(tenant_id="t3"))
    assert out.status == "rejected"


def test_resolve_is_idempotent():
    _fresh()
    item = create_approval("t4", "seo", "Apply fixes", "do_this")
    approve(item.id, ResolveBody(tenant_id="t4"))
    again = approve(item.id, ResolveBody(tenant_id="t4"))
    assert again.status == "executed"


def test_tenant_isolation():
    _fresh()
    create_approval("ta", "website", "A", "do_this")
    assert list_approvals(tenant_id="tb") == []


if __name__ == "__main__":
    for n, f in sorted(globals().items()):
        if n.startswith("test_") and callable(f):
            f(); print("ok", n)
