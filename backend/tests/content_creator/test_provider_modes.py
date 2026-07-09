"""Three provider/billing modes — client_own_account, pixie_managed, prompt_export.

SDK + httpx are mocked (zero spend). The headline invariant (spec §19): missing
global env credentials block ONLY ``pixie_managed`` — a ``client_own_account``
tenant with its own connected key still generates, and ``prompt_export`` always
works and returns a prompt (never a fake video).
"""

from __future__ import annotations

import os
import sys
import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.router import router
from content_creator.providers import credentials as provider_credentials

app = FastAPI()
app.include_router(router)
client = TestClient(app)
B = "/api/content-creator"


def _make_fake_sdk():
    mod = types.ModuleType("higgsfield_client")

    class Status: ...
    class Queued(Status): ...
    class InProgress(Status): ...
    class Completed(Status): ...
    class Failed(Status): ...
    class NSFW(Status): ...
    class Cancelled(Status): ...

    class _Ctrl:
        def __init__(self, rid):
            self.request_id = rid

    STATE = {
        "request_id": "req_ABC",
        "status_seq": [Completed],
        "result": {"status": "completed", "video": {"url": "https://cdn.test/v.mp4"}},
    }

    class SyncClient:
        def __init__(self, api_key=None, **kw):
            self.api_key = api_key

        def submit(self, model, arguments, webhook_url=None):
            STATE["last"] = {"api_key": self.api_key, "model": model, "arguments": arguments}
            return _Ctrl(STATE["request_id"])

        def status(self, request_id):
            seq = STATE["status_seq"]
            return (seq.pop(0) if len(seq) > 1 else seq[0])()

        def result(self, request_id):
            return STATE["result"]

        def upload(self, data, content_type):
            return "https://cdn.higgsfield.ai/ref.png"

    for n in ("Status", "Queued", "InProgress", "Completed", "Failed", "NSFW", "Cancelled"):
        setattr(mod, n, locals()[n])
    mod.SyncClient = SyncClient
    mod.STATE = STATE
    return mod


class _Resp:
    def __init__(self, status_code=200, content=b"", headers=None, json_data=None):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self._json = json_data or {}

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPError("HTTP %d" % self.status_code)


class _FakeHttpxClient:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, headers=None, json=None):
        return _Resp(200, json_data={"public_url": "https://u", "upload_url": "https://up"})

    def get(self, url):
        return _Resp(200, content=b"MP4", headers={"content-type": "video/mp4"})


def _install(monkeypatch, tmp_path, *, env_creds: bool):
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")
    monkeypatch.setenv("CONTENT_CREATOR_DRY_RUN", "true")
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.delenv("CONTENT_CREATOR_DEFAULT_PROVIDER_MODE", raising=False)
    if env_creds:
        monkeypatch.setenv("HIGGSFIELD_API_KEY", "pixie-key")
        monkeypatch.setenv("HIGGSFIELD_API_SECRET", "pixie-secret")
        monkeypatch.setenv("HIGGSFIELD_VIDEO_MODEL", "higgsfield-ai/soul/standard")
    else:
        for k in ("HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET", "HIGGSFIELD_KEY",
                  "HF_KEY", "HIGGSFIELD_VIDEO_MODEL"):
            monkeypatch.delenv(k, raising=False)
    fake = _make_fake_sdk()
    monkeypatch.setitem(sys.modules, "higgsfield_client", fake)
    import content_creator.providers.higgsfield as hf
    monkeypatch.setattr(hf.httpx, "Client", _FakeHttpxClient)
    return fake


@pytest.fixture
def no_env(monkeypatch, tmp_path):
    return _install(monkeypatch, tmp_path, env_creds=False)


@pytest.fixture
def pixie_env(monkeypatch, tmp_path):
    return _install(monkeypatch, tmp_path, env_creds=True)


def _drive_to_production(t):
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme", "niche": "hvac"})
    client.post(f"{B}/influencer/upload-reference", json={"tenant_id": t, "reference_ref": "https://cdn.test/face.png"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t})
    iid = gen.json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{iid}/approve", json={"tenant_id": t})
    sid = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": iid}).json()["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})
    client.post(f"{B}/production/approve", json={"tenant_id": t})
    return sid


# --------------------------------------------------------------------------- #
# Connect — per mode
# --------------------------------------------------------------------------- #
def test_client_own_connect_requires_api_key(no_env):
    r = client.post(f"{B}/provider/connect", json={"tenant_id": "m_ca_nokey", "mode": "client_own_account"})
    assert r.status_code == 422
    assert r.json()["detail"]["status"] == "missing_credentials"


def test_client_own_connect_validates_and_hides_secret(no_env):
    t = "m_ca_ok"
    r = client.post(f"{B}/provider/connect", json={
        "tenant_id": t, "mode": "client_own_account",
        "api_key": "clientkey1234", "api_secret": "clientsecret9999",
        "model_id": "higgsfield-ai/soul/standard",
    })
    assert r.status_code == 200, r.text
    prov = r.json()["provider"]
    assert prov["connected"] is True and prov["configured"] is True
    # Neither the full key nor the secret may appear (a masked tail fingerprint is OK).
    assert "clientkey1234" not in r.text and "clientsecret9999" not in r.text
    assert provider_credentials.has_tenant_credential(t)


def test_pixie_managed_requires_env_credentials(no_env):
    r = client.post(f"{B}/provider/connect", json={"tenant_id": "m_pm_noenv", "mode": "pixie_managed"})
    assert r.status_code == 200
    assert r.json()["status"] == "provider_not_configured"


def test_pixie_managed_connects_with_env(pixie_env):
    r = client.post(f"{B}/provider/connect", json={"tenant_id": "m_pm_env", "mode": "pixie_managed"})
    prov = r.json()["provider"]
    assert prov["connected"] is True and prov["mode"] == "pixie_managed"
    assert prov["account_ref"] == "pixie-managed"   # never a client key


def test_prompt_export_requires_no_credentials(no_env):
    r = client.post(f"{B}/provider/connect", json={"tenant_id": "m_pe", "mode": "prompt_export"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "configured" and body["mode"] == "prompt_export"


# --------------------------------------------------------------------------- #
# Status per mode
# --------------------------------------------------------------------------- #
def test_status_reflects_tenant_mode(no_env):
    client.post(f"{B}/provider/connect", json={
        "tenant_id": "m_st_ca", "mode": "client_own_account",
        "api_key": "ck", "api_secret": "cs", "model_id": "higgsfield-ai/soul/standard"})
    s = client.get(f"{B}/status", params={"tenant_id": "m_st_ca"}).json()
    assert s["provider"]["mode"] == "client_own_account"
    assert s["billing"]["mode"] == "client_credits"

    client.post(f"{B}/provider/connect", json={"tenant_id": "m_st_pe", "mode": "prompt_export"})
    s2 = client.get(f"{B}/status", params={"tenant_id": "m_st_pe"}).json()
    assert s2["provider"]["mode"] == "prompt_export"
    assert s2["billing"]["requires_cost_approval"] is False


# --------------------------------------------------------------------------- #
# The headline rule: missing env blocks ONLY pixie_managed
# --------------------------------------------------------------------------- #
def test_client_own_generates_without_env_creds(no_env):
    t = "m_ca_gen"
    client.post(f"{B}/provider/connect", json={
        "tenant_id": t, "mode": "client_own_account",
        "api_key": "ck", "api_secret": "cs", "model_id": "higgsfield-ai/soul/standard"})
    sid = _drive_to_production(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 200, r.text
    v = r.json()["video"]
    assert v["status"] == "generating"
    assert v["provider_mode"] == "client_own_account"
    assert v["provider_job_id"] == "req_ABC"
    # The submit used the tenant's OWN credential (not env, which is unset).
    assert no_env.STATE["last"]["api_key"] == "ck:cs"


def test_pixie_managed_blocked_without_env(no_env):
    t = "m_pm_block"
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_managed"})
    sid = _drive_to_production(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 400
    assert r.json()["detail"]["status"] == "provider_not_configured"
    from content_creator.store import get_video_repository
    assert get_video_repository().list(t) == []   # no spend, no video


# --------------------------------------------------------------------------- #
# Pixie managed — env creds + billable usage record
# --------------------------------------------------------------------------- #
def test_pixie_managed_generation_records_usage(pixie_env):
    t = "m_pm_usage"
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_managed"})
    sid = _drive_to_production(t)
    vid = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()["id"]
    usage = client.get(f"{B}/usage", params={"tenant_id": t}).json()["usage"]
    assert len(usage) == 1
    assert usage[0]["provider_mode"] == "pixie_managed"
    assert usage[0]["status"] == "submitted"
    assert usage[0]["video_ref"] == vid


# --------------------------------------------------------------------------- #
# Prompt export — returns a prompt, never a fake video
# --------------------------------------------------------------------------- #
def test_prompt_export_returns_prompt_not_video(no_env):
    t = "m_pe_gen"
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "prompt_export"})
    sid = _drive_to_production(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "prompt_export_ready"
    assert body["provider_mode"] == "prompt_export"
    assert body["prompt"] and "SCRIPT" in body["prompt"]
    # No video row and no billable usage were created.
    from content_creator.store import get_video_repository, get_usage_repository
    assert get_video_repository().list(t) == []
    assert get_usage_repository().list(t) == []


# --------------------------------------------------------------------------- #
# provider/test + disconnect
# --------------------------------------------------------------------------- #
def test_provider_test_and_disconnect(no_env):
    t = "m_disc"
    client.post(f"{B}/provider/connect", json={
        "tenant_id": t, "mode": "client_own_account",
        "api_key": "ck", "api_secret": "cs", "model_id": "higgsfield-ai/soul/standard"})
    assert provider_credentials.has_tenant_credential(t)
    tr = client.post(f"{B}/provider/test", json={"tenant_id": t}).json()
    assert tr["connected"] is True and tr["mode"] == "client_own_account"
    client.post(f"{B}/provider/disconnect", json={"tenant_id": t})
    assert not provider_credentials.has_tenant_credential(t)
