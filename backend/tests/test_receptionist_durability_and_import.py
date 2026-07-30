"""Production durability guard (Part 6) + local-data import tool (Part 9)."""

from __future__ import annotations

import importlib

import pytest


# ── durability guard ──────────────────────────────────────────────────────────

def test_durability_guard_off_by_default(monkeypatch):
    monkeypatch.delenv("AI_RECEPTIONIST_REQUIRE_DURABLE", raising=False)
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    from receptionist.service import durability
    durability.check_durability()  # no-op


def test_durability_guard_blocks_memory_when_required(monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_DURABLE", "1")
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    from receptionist.service import durability
    with pytest.raises(durability.ReceptionistDurabilityError):
        durability.check_durability()


def test_durability_guard_allows_file(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_DURABLE", "1")
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    from receptionist.service import durability
    durability.check_durability()  # file is durable → ok


# ── import tool ───────────────────────────────────────────────────────────────

@pytest.fixture()
def import_env(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def _load_tool():
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
    return importlib.import_module("receptionist_import")


def test_import_dry_run_runs_cleanly(import_env):
    # Dry-run over whatever local JSON exists: reports counts, writes nothing, no errors.
    from receptionist.service import stores
    tool = _load_tool()
    before = stores.consent().count("t_any")
    result = tool.import_all(dry_run=True)
    assert result["mode"] == "dry-run"
    assert result["onboarding"]["errors"] == 0
    assert result["campaign_compliance"]["errors"] == 0
    assert stores.consent().count("t_any") == before  # dry-run wrote nothing


def test_import_roundtrip_from_json(import_env, tmp_path, monkeypatch):
    """A JSON onboarding profile imports into config_repo, and a rerun skips it."""
    from receptionist.onboarding import store as ostore
    from receptionist.service import config_repo
    # Point the onboarding JSON dir at a temp location and write one profile.
    monkeypatch.setattr(ostore, "_DIR", tmp_path)
    tid = ostore.save_tenant(business_name="Testco", industry="salon",
                             core={"BUSINESS_NAME": "Testco", "HOURS": "Mon-Fri 9-5"}, answers=[])
    # save_tenant already grounded config_repo; simulate a fresh DB to test import.
    from receptionist.service import stores
    stores.reset_all()
    assert config_repo.get_active(tid) is None

    tool = _load_tool()
    imported = tool.import_all(dry_run=False)
    assert imported["onboarding"]["imported"] >= 1
    assert config_repo.get_active(tid) is not None
    # rerun is safe → now skipped
    again = tool.import_all(dry_run=True)
    assert again["onboarding"]["skipped_existing"] >= 1


def test_import_is_rerun_safe(import_env):
    from receptionist.service import config_repo
    tool = _load_tool()
    # Nothing on disk for these tenants → counts are zero/consistent across reruns.
    r1 = tool.import_all(dry_run=True)
    r2 = tool.import_all(dry_run=True)
    assert r1["onboarding"]["found"] == r2["onboarding"]["found"]
    assert r1["campaign_compliance"]["errors"] == 0
