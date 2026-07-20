"""Startup config summary + durability guardrail (test / dev / production shapes).

Run: .venv/bin/python -m pytest tests/content_creator/test_startup_config.py -q
"""

from __future__ import annotations

import pytest

import startup_checks as sc


def test_dev_memory_summary_no_raise(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("PIXIE_REQUIRE_DURABLE", raising=False)
    s = sc.validate_content_config()
    assert s["persistence"] == "memory"
    assert s["durable"] is False
    # AI mock mode is independent of persistence — mock generation stays $0 by default
    assert s["content_creator_mock"] is True
    assert s["dry_run_posting"] is True


def test_production_requires_durable_raises_on_memory(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)  # memory
    monkeypatch.setenv("PIXIE_REQUIRE_DURABLE", "1")
    with pytest.raises(sc.StartupConfigError):
        sc.validate_content_config()


def test_require_durable_satisfied_by_file(monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_REQUIRE_DURABLE", "1")
    s = sc.validate_content_config()
    assert s["durable"] is True and s["persistence"] == "file"


def test_supabase_without_creds_fails_fast(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    # never a silent fallback to memory — a clear configuration error instead
    import persistence
    with pytest.raises(persistence.PersistenceNotConfigured):
        sc.validate_content_config()


def test_persistence_and_ai_mode_are_independent(monkeypatch, tmp_path):
    # durable persistence + mock AI should coexist (mock generation on durable store)
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("CONTENT_CREATOR_MOCK", raising=False)
    s = sc.content_config_summary()
    assert s["durable"] is True
    assert s["content_creator_mock"] is True
