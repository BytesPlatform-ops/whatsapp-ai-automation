"""Atomic multi-instance Receptionist worker claiming (Wave 6, Part 2).

Hermetic ($0, memory backend). Proves a single job cannot be claimed by two
instances concurrently, stale locks recover, heartbeats extend, completion is
idempotent, cancellation cannot race into execution, and due ordering respects
priority.
"""

from __future__ import annotations

import threading

import pytest

from receptionist.worker import jobs_store as js


@pytest.fixture(autouse=True)
def _mem(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    js.reset_stores()
    yield
    js.reset_stores()


def test_only_one_instance_claims_a_job():
    job_id = js.enqueue("t_a", "reminder", {"x": 1})
    results = []
    barrier = threading.Barrier(8)

    def worker(i):
        barrier.wait()  # maximize the race
        results.append(js.claim(job_id, "t_a", owner=f"w{i}", ttl=60))

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(1 for r in results if r) == 1, results


def test_stale_lock_recovers():
    job_id = js.enqueue("t_a", "reminder", {})
    assert js.claim(job_id, "t_a", owner="w1", ttl=60)
    # expire the lock in place
    repo = js._jobs()
    row = repo.get("t_a", job_id)
    job = row["data"]
    job["lock_expires_at"] = "1970-01-01T00:00:00+00:00"
    repo.upsert(js._job_row(job))
    # a different instance can now reclaim
    assert js.claim(job_id, "t_a", owner="w2", ttl=60)
    row2 = repo.get("t_a", job_id)
    assert row2["data"]["lock_owner"] == "w2"


def test_live_lock_blocks_other_owner():
    job_id = js.enqueue("t_a", "reminder", {})
    assert js.claim(job_id, "t_a", owner="w1", ttl=300)
    assert not js.claim(job_id, "t_a", owner="w2", ttl=300)
    assert js.claim(job_id, "t_a", owner="w1", ttl=300)  # same owner idempotent


def test_heartbeat_requires_ownership():
    job_id = js.enqueue("t_a", "reminder", {})
    js.claim(job_id, "t_a", owner="w1", ttl=60)
    assert js.heartbeat(job_id, "t_a", owner="w1", ttl=120)
    assert not js.heartbeat(job_id, "t_a", owner="someone_else", ttl=120)


def test_completion_is_idempotent():
    job_id = js.enqueue("t_a", "reminder", {})
    js.claim(job_id, "t_a", owner="w1", ttl=60)
    assert js.complete(job_id, "t_a", owner="w1", result={"ok": True})
    # a second completion by a non-owner (lock cleared) does not resurrect/execute
    assert not js.complete(job_id, "t_a", owner="w1")
    row = js._jobs().get("t_a", job_id)
    assert row["data"]["status"] == js.STATUS_COMPLETED


def test_cancel_prevents_claim():
    job_id = js.enqueue("t_a", "reminder", {})
    assert js.cancel(job_id, "t_a")
    assert not js.claim(job_id, "t_a", owner="w1", ttl=60)


def test_due_jobs_priority_order():
    lo = js.enqueue("t_a", "reminder", {}, priority=0)
    hi = js.enqueue("t_a", "reminder", {}, priority=10)
    due = js.due_jobs(limit=10)
    ids = [jid for jid, _ in due]
    assert ids.index(hi) < ids.index(lo)
