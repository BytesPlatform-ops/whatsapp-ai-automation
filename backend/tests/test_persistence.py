"""Persistence layer: backend selection, missing-env errors, file round-trip,
and a mocked Supabase adapter (no real network). A real Supabase integration
test runs only with PIXIE_RUN_SUPABASE_TESTS=1 + creds."""

from __future__ import annotations

import os

import pytest

import persistence


def test_persistence_backend_selects_memory(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    assert persistence.backend() == "memory"
    assert persistence.enabled() is False


def test_persistence_backend_selects_file(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    assert persistence.backend() == "file" and persistence.enabled() is True


def test_persistence_backend_selects_supabase_when_configured(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc")
    assert persistence.backend() == "supabase"
    assert persistence.supabase_configured() is True
    persistence.require_supabase()  # should not raise


def test_supabase_missing_env_errors_cleanly(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "supabase")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(persistence.PersistenceNotConfigured):
        persistence.require_supabase()
    with pytest.raises(persistence.PersistenceNotConfigured):
        persistence.table("approval_items")  # backend build must fail loudly


def test_file_row_repo_round_trip(monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    repo = persistence.table("widgets")
    repo.upsert(persistence.envelope("w1", "t1", {"name": "A"}))
    repo.upsert(persistence.envelope("w2", "t1", {"name": "B"}))
    # a fresh repo (simulating another process/instance) reads the same file
    repo2 = persistence.table("widgets")
    rows = repo2.list_by_tenant("t1")
    assert [r["data"]["name"] for r in rows] == ["A", "B"]
    assert repo2.get("t1", "w1")["data"]["name"] == "A"
    assert repo2.delete("t1", "w1") is True
    assert persistence.table("widgets").get("t1", "w1") is None


class _FakeResp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


class _FakeClient:
    """Captures Supabase REST calls and returns canned responses."""
    calls: list = []
    store: dict = {}

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, headers=None, json=None, **k):
        _FakeClient.calls.append(("POST", url, json))
        rows = json if isinstance(json, list) else [json]
        for r in rows:
            _FakeClient.store[r["id"]] = r
        return _FakeResp(201, rows)

    def get(self, url, headers=None, params=None, **k):
        _FakeClient.calls.append(("GET", url, params))
        return _FakeResp(200, list(_FakeClient.store.values()))

    def delete(self, url, headers=None, params=None, **k):
        return _FakeResp(204, [])


def test_meta_connection_persists_through_supabase_adapter_mock(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "supabase")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc")
    import httpx
    _FakeClient.calls = []
    _FakeClient.store = {}
    monkeypatch.setattr(httpx, "Client", _FakeClient)

    repo = persistence.table("approval_items")
    repo.upsert(persistence.envelope("ap_x", "t_supa", {"status": "pending"}))
    # a POST hit the approval_items REST endpoint
    assert any(m == "POST" and "approval_items" in url for m, url, _ in _FakeClient.calls)
    rows = repo.list_by_tenant("t_supa")
    assert rows and rows[0]["data"]["status"] == "pending"


def test_content_asset_saved_to_persistence(monkeypatch, tmp_path):
    """File mode: an uploaded ContentAsset row survives a fresh store instance."""
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    import content.service as csvc
    csvc._store = None
    import base64
    asset = csvc.create_asset_from_base64("t_c", filename="a.png", content_type="image/png",
                                          data_base64=base64.b64encode(b"x").decode())
    csvc._store = None  # simulate restart
    assert csvc.get_asset("t_c", asset.id) is not None


@pytest.mark.skipif(os.getenv("PIXIE_RUN_SUPABASE_TESTS") != "1",
                    reason="opt-in real Supabase integration test")
def test_real_supabase_round_trip():
    os.environ["PIXIE_PERSIST"] = "supabase"
    repo = persistence.table("activity_logs")
    repo.upsert(persistence.envelope("it_1", "t_it", {"type": "integration_test"}))
    rows = repo.list_by_tenant("t_it")
    assert any(r["id"] == "it_1" for r in rows)
