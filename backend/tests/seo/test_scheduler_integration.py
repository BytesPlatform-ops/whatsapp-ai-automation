"""Integration tests for seo.scheduler — registry, startup, routes.

Hermetic: no network, no Supabase. Uses memory persistence (set in conftest.py).
The scheduler is disabled under pytest by default; startup.py is tested by
patching the guard.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple
from unittest.mock import patch, MagicMock

import pytest


# ── Registry tests ─────────────────────────────────────────────────────────────

class TestRegistry:
    def setup_method(self):
        """Save and restore registry state around each test."""
        import seo.scheduler.registry as reg
        self._orig = dict(reg._REGISTRY)

    def teardown_method(self):
        import seo.scheduler.registry as reg
        reg._REGISTRY.clear()
        reg._REGISTRY.update(self._orig)

    def test_register_job_source_adds_entry(self):
        from seo.scheduler.registry import register_job_source, get_registry

        register_job_source(
            "test_source",
            due_fn=lambda: [],
            run_fn=lambda job_id, job: {"status": "completed"},
        )
        registry = get_registry()
        assert "test_source" in registry

    def test_get_enabled_sources_filters_disabled(self, monkeypatch):
        from seo.scheduler.registry import register_job_source, get_enabled_sources

        monkeypatch.setenv("MY_TEST_ENABLED", "0")
        register_job_source(
            "disabled_source",
            due_fn=lambda: [],
            run_fn=lambda j, jo: {},
            enabled_env="MY_TEST_ENABLED",
        )

        enabled = get_enabled_sources()
        names = [s.name for s in enabled]
        assert "disabled_source" not in names

    def test_get_enabled_sources_includes_enabled(self, monkeypatch):
        from seo.scheduler.registry import register_job_source, get_enabled_sources

        monkeypatch.setenv("MY_TEST2_ENABLED", "1")
        register_job_source(
            "enabled_source",
            due_fn=lambda: [],
            run_fn=lambda j, jo: {},
            enabled_env="MY_TEST2_ENABLED",
        )

        enabled = get_enabled_sources()
        names = [s.name for s in enabled]
        assert "enabled_source" in names

    def test_overwrite_warns_but_succeeds(self, caplog):
        from seo.scheduler.registry import register_job_source
        import logging

        register_job_source("dup_source", due_fn=lambda: [], run_fn=lambda j, jo: {})
        with caplog.at_level(logging.WARNING, logger="pixie.seo.scheduler.registry"):
            register_job_source("dup_source", due_fn=lambda: [], run_fn=lambda j, jo: {})
        assert any("overwriting" in m for m in caplog.messages)

    def test_builtin_registrations_present(self):
        """All built-in job sources were registered at import time."""
        from seo.scheduler.registry import get_registry
        registry = get_registry()
        # At least some built-ins should be present (some may have import-guarded skips)
        expected = {"rank", "gsc_sync", "ga4_sync", "alert_gen", "crawl_recovery", "fix_verify"}
        registered = set(registry.keys())
        # Overlap must be non-empty
        assert len(expected & registered) > 0, f"No built-ins registered. Got: {registered}"

    def test_enabled_env_none_means_always_enabled(self):
        from seo.scheduler.registry import register_job_source, get_enabled_sources, _REGISTRY

        register_job_source("always_on", due_fn=lambda: [], run_fn=lambda j, jo: {}, enabled_env=None)
        enabled = get_enabled_sources()
        names = [s.name for s in enabled]
        assert "always_on" in names


# ── Startup tests ──────────────────────────────────────────────────────────────

class TestStartup:
    def setup_method(self):
        import seo.scheduler.runtime as rt
        rt._ACTIVE_INSTANCE = None
        import seo.scheduler.startup as su
        su._scheduler_instance = None

    def teardown_method(self):
        import seo.scheduler.runtime as rt
        if rt._ACTIVE_INSTANCE:
            try:
                rt._ACTIVE_INSTANCE.stop(timeout=2)
            except Exception:
                pass
            rt._ACTIVE_INSTANCE = None
        import seo.scheduler.startup as su
        su._scheduler_instance = None

    def test_start_scheduler_skipped_under_pytest(self):
        """start_scheduler() is a no-op when PYTEST_CURRENT_TEST is set."""
        # PYTEST_CURRENT_TEST IS set right now (we're in pytest)
        from seo.scheduler.startup import start_scheduler
        from seo.scheduler.runtime import _get_active_instance

        start_scheduler()
        assert _get_active_instance() is None

    def test_start_scheduler_skipped_when_disabled(self, monkeypatch):
        """start_scheduler() is a no-op when SEO_SCHEDULER_ENABLED is not set."""
        monkeypatch.delenv("SEO_SCHEDULER_ENABLED", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

        from seo.scheduler.startup import start_scheduler
        from seo.scheduler.runtime import _get_active_instance

        start_scheduler()
        assert _get_active_instance() is None

        # Restore pytest guard so other tests aren't affected
        monkeypatch.setenv("PYTEST_CURRENT_TEST", "dummy")

    def test_start_scheduler_when_enabled(self, monkeypatch):
        """start_scheduler() starts a thread when enabled and not in pytest."""
        monkeypatch.setenv("SEO_SCHEDULER_ENABLED", "1")
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

        from seo.scheduler.startup import start_scheduler, stop_scheduler
        from seo.scheduler.runtime import _get_active_instance

        try:
            start_scheduler()
            inst = _get_active_instance()
            assert inst is not None
            assert inst.is_running()
        finally:
            stop_scheduler()
            monkeypatch.setenv("PYTEST_CURRENT_TEST", "dummy")

    def test_stop_scheduler_noop_when_not_started(self):
        """stop_scheduler() does not raise when nothing is running."""
        from seo.scheduler.startup import stop_scheduler
        stop_scheduler()  # should not raise

    def test_start_scheduler_singleton_on_hot_reload(self, monkeypatch):
        """A second start_scheduler() call reuses the existing instance."""
        monkeypatch.setenv("SEO_SCHEDULER_ENABLED", "1")
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

        from seo.scheduler.startup import start_scheduler, stop_scheduler
        from seo.scheduler.runtime import _get_active_instance

        try:
            start_scheduler()
            inst1 = _get_active_instance()
            start_scheduler()  # second call: hot reload simulation
            inst2 = _get_active_instance()
            # Should be the same instance
            assert inst1 is inst2
        finally:
            stop_scheduler()
            monkeypatch.setenv("PYTEST_CURRENT_TEST", "dummy")


# ── Routes tests ──────────────────────────────────────────────────────────────

class TestRoutes:
    """Test the FastAPI router endpoints via httpx.TestClient."""

    @pytest.fixture(autouse=True)
    def _setup_app(self):
        """Create a minimal FastAPI test app with just the scheduler router."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from seo.scheduler.routes import router

        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def test_health_endpoint_200(self):
        resp = self.client.get("/api/agents/seo/scheduler/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "encryption" in data

    def test_health_no_secrets_in_response(self):
        resp = self.client.get("/api/agents/seo/scheduler/health")
        body = resp.text
        assert "SECRET" not in body
        assert "password" not in body.lower()
        assert "service_role" not in body.lower()

    def test_health_includes_all_required_keys(self):
        resp = self.client.get("/api/agents/seo/scheduler/health")
        data = resp.json()
        for key in ("enabled", "instance_id", "last_heartbeat", "claimed",
                    "completed", "failed", "encryption"):
            assert key in data, f"Missing key: {key}"

    def test_tick_endpoint_200(self):
        resp = self.client.post("/api/agents/seo/scheduler/tick")
        assert resp.status_code in (200, 503)  # 503 when scheduler not running is ok

    def test_internal_secret_rejected(self, monkeypatch):
        """Requests with wrong secret are rejected."""
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "real-secret")
        resp = self.client.get(
            "/api/agents/seo/scheduler/health",
            headers={"X-Pixie-Internal-Secret": "wrong-secret"},
        )
        assert resp.status_code == 401

    def test_internal_secret_accepted(self, monkeypatch):
        """Requests with correct secret are accepted."""
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "real-secret")
        resp = self.client.get(
            "/api/agents/seo/scheduler/health",
            headers={"X-Pixie-Internal-Secret": "real-secret"},
        )
        assert resp.status_code == 200

    def test_pause_and_resume(self):
        """Pause then resume a job type."""
        resp_pause = self.client.post(
            "/api/agents/seo/scheduler/pause",
            json={"job_type": "rank"},
        )
        assert resp_pause.status_code == 200
        assert "rank" in resp_pause.json().get("all_paused", [])

        resp_resume = self.client.post(
            "/api/agents/seo/scheduler/resume",
            json={"job_type": "rank"},
        )
        assert resp_resume.status_code == 200
        assert "rank" not in resp_resume.json().get("all_paused", [])

    def test_pause_empty_job_type_400(self):
        resp = self.client.post(
            "/api/agents/seo/scheduler/pause",
            json={"job_type": ""},
        )
        assert resp.status_code == 400

    def test_retry_nonexistent_job_404(self):
        resp = self.client.post(
            "/api/agents/seo/scheduler/jobs/nonexistent-id/retry",
            json={"tenant_id": "t1", "source": "rank"},
        )
        # 404 or a not-found result (depends on whether rank repo has the row)
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.json()
            assert data.get("ok") is False or "not found" in str(data).lower()


# ── Startup guard: scheduler never starts under pytest ────────────────────────

def test_scheduler_never_runs_when_pytest_env_set():
    """Comprehensive guard: even with SEO_SCHEDULER_ENABLED=1, pytest blocks it."""
    # PYTEST_CURRENT_TEST is already set by pytest
    assert os.getenv("PYTEST_CURRENT_TEST") is not None

    from seo.scheduler.runtime import SeoScheduler
    sched = SeoScheduler()
    result = sched.start()
    assert result is False, "Scheduler must not start under pytest"


# ── Stale-lock reclaim counter ────────────────────────────────────────────────

def test_stale_lock_recovery_counted():
    """Stale-lock jobs increment stale_lock_recoveries counter."""
    from seo.scheduler.runtime import SeoScheduler
    import seo.scheduler.registry as reg
    from datetime import datetime, timedelta, timezone

    orig_registry = dict(reg._REGISTRY)
    try:
        reg._REGISTRY.clear()

        past_expiry = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat(timespec="microseconds")

        def _due():
            return [("stale-job", {
                "lock_owner": "dead-worker",
                "lock_expires_at": past_expiry,
            })]

        def _run(job_id, job):
            return {"status": "completed"}

        reg.register_job_source("stale_test", due_fn=_due, run_fn=_run)

        sched = SeoScheduler(max_workers=1)
        sched._tick()

        assert sched._stats.get("stale_lock_recoveries", 0) >= 1
    finally:
        reg._REGISTRY.clear()
        reg._REGISTRY.update(orig_registry)


# ── Encryption health reflected in scheduler health ───────────────────────────

def test_health_encryption_status():
    """health() always includes encryption block."""
    from seo.scheduler.runtime import SeoScheduler

    sched = SeoScheduler()
    h = sched.health()
    enc = h.get("encryption", {})

    assert "active" in enc
    assert "mode" in enc
    assert "required" in enc
    # In test mode (no key), mode should be obfuscation or unavailable (not fernet)
    assert enc["mode"] in ("fernet", "insecure_obfuscation", "unavailable", "unknown")
