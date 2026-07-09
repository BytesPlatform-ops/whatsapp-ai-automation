"""Real Higgsfield connector + real-mode router behavior — SDK & httpx MOCKED.

These tests exercise the REAL code paths (CONTENT_CREATOR_MOCK=false) without a
network or a real key: the official ``higgsfield_client`` SDK is replaced with a
scripted fake in ``sys.modules`` and ``httpx`` is stubbed, so nothing spends a
credit. The key invariants:

  * a real credential is required and is NEVER returned to a caller,
  * real mode without a configured provider BLOCKS generation (no silent mock),
  * generation is an async job: submit → poll → download → re-host to storage,
  * a provider error surfaces as provider_error (never a fabricated success),
  * quality-check refuses an unfinished video,
  * the 4 gates still hold.

A single opt-in test hits the real API and only runs with
``RUN_HIGGSFIELD_INTEGRATION_TESTS=1`` and real credentials.
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


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #
def _make_fake_sdk():
    """A fake ``higgsfield_client`` module scripted via ``module.STATE``."""
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
        "submit": None,            # set to an Exception to simulate a submit failure
        "request_id": "req_123",
        "status_seq": [Completed], # classes returned by successive status() calls
        "result": {"status": "completed", "video": {"url": "https://cdn.test/higgs/v.mp4"}},
    }

    class SyncClient:
        def __init__(self, api_key=None, **kw):
            self.api_key = api_key

        def submit(self, model, arguments, webhook_url=None):
            beh = STATE["submit"]
            if isinstance(beh, Exception):
                raise beh
            STATE["last_submit"] = {"model": model, "arguments": arguments}
            return _Ctrl(STATE["request_id"])

        def status(self, request_id):
            seq = STATE["status_seq"]
            cls = seq.pop(0) if len(seq) > 1 else seq[0]
            return cls()

        def result(self, request_id):
            return STATE["result"]

        def upload(self, data, content_type):
            beh = STATE.get("upload")
            if isinstance(beh, Exception):
                raise beh
            STATE["last_upload"] = {"content_type": content_type, "size": len(data)}
            return STATE.get("upload_url", "https://cdn.higgsfield.ai/uploads/ref.png")

    mod.Status = Status
    mod.Queued = Queued
    mod.InProgress = InProgress
    mod.Completed = Completed
    mod.Failed = Failed
    mod.NSFW = NSFW
    mod.Cancelled = Cancelled
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
    """Stub for httpx.Client used by test_connection (post) and _fetch_bytes (get)."""

    auth_status = 200
    media_bytes = b"FAKE_MP4_BYTES"

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, headers=None, json=None):
        return _Resp(status_code=_FakeHttpxClient.auth_status,
                     json_data={"public_url": "https://u", "upload_url": "https://up"})

    def get(self, url):
        return _Resp(status_code=200, content=_FakeHttpxClient.media_bytes,
                     headers={"content-type": "video/mp4"})


@pytest.fixture
def real_env(monkeypatch, tmp_path):
    """Turn on real mode with a configured (fake) Higgsfield provider + offline storage."""
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")
    monkeypatch.setenv("CONTENT_CREATOR_DRY_RUN", "true")
    monkeypatch.setenv("HIGGSFIELD_API_KEY", "test-key")
    monkeypatch.setenv("HIGGSFIELD_API_SECRET", "test-secret")
    monkeypatch.setenv("HIGGSFIELD_VIDEO_MODEL", "higgsfield-ai/soul/standard")
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    fake = _make_fake_sdk()
    monkeypatch.setitem(sys.modules, "higgsfield_client", fake)
    import content_creator.providers.higgsfield as hf
    monkeypatch.setattr(hf.httpx, "Client", _FakeHttpxClient)
    _FakeHttpxClient.auth_status = 200
    return fake


def _ready_for_video(t):
    """Drive stages 1-8 to an approved script + approved production for tenant t."""
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme", "niche": "hvac repair"})
    client.post(f"{B}/influencer/upload-reference", json={"tenant_id": t, "reference_ref": "https://cdn.test/face.png"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t})
    idea_id = gen.json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})
    s = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id})
    sid = s.json()["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})
    client.post(f"{B}/production/approve", json={"tenant_id": t})
    return sid


# --------------------------------------------------------------------------- #
# Status / configuration
# --------------------------------------------------------------------------- #
def test_status_shows_real_provider_configured(real_env):
    r = client.get(f"{B}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["mock_mode"] is False
    assert body["provider"]["name"] == "higgsfield"
    assert body["provider"]["configured"] is True
    assert body["provider"]["capabilities"]["video_generation"] is True
    assert body["approval_gates"] == {"idea": True, "script": True, "production": True, "publish": True}


def test_status_provider_not_configured_without_key(monkeypatch):
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")
    monkeypatch.delenv("HIGGSFIELD_API_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_KEY", raising=False)
    monkeypatch.delenv("HF_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_VIDEO_MODEL", raising=False)
    body = client.get(f"{B}/status").json()
    assert body["provider"]["configured"] is False
    assert body["provider"]["status"] == "provider_not_configured"
    assert body["provider"]["mode"] == "pixie_managed"      # default mode when no key
    assert body["billing"]["mode"] == "pixie_wallet"


# --------------------------------------------------------------------------- #
# Provider connect — key handling
# --------------------------------------------------------------------------- #
def test_provider_connect_validates_and_never_returns_key(real_env):
    t = "real_connect_ok"
    r = client.post(f"{B}/provider/connect", json={
        "tenant_id": t, "mode": "user_account",
        "api_key": "client-key", "api_secret": "client-secret",
    })
    assert r.status_code == 200, r.text
    prov = r.json()["provider"]
    assert prov["connected"] is True
    assert prov["status"] == "connected"
    assert prov["connection_type"] == "api_key"
    # The raw key/secret must NOT appear anywhere in the response.
    blob = r.text
    assert "client-key" not in blob and "client-secret" not in blob
    # account_ref is a masked hint only.
    assert prov["account_ref"].startswith("hf_")
    assert "client-secret" not in prov["account_ref"]


def test_provider_connect_invalid_key(real_env):
    _FakeHttpxClient.auth_status = 401
    t = "real_connect_bad"
    r = client.post(f"{B}/provider/connect", json={
        "tenant_id": t, "mode": "user_account", "api_key": "bad:key",
    })
    assert r.status_code == 200
    prov = r.json()["provider"]
    assert prov["connected"] is False
    assert prov["status"] == "invalid_credentials"


# --------------------------------------------------------------------------- #
# Influencer reference hosting
# --------------------------------------------------------------------------- #
def test_upload_reference_hosts_image(real_env):
    import base64
    t = "real_host"
    data = base64.b64encode(b"\x89PNG\r\n fake image bytes").decode()
    r = client.post(f"{B}/influencer/upload-reference", json={
        "tenant_id": t, "image_base64": data, "content_type": "image/png", "filename": "face.png",
    })
    assert r.status_code == 200, r.text
    ident = r.json()["identity"]
    assert ident["reference_hosted"] is True
    assert ident["reference_asset_id"]
    assert ident["reference_ref"]                      # a hosted URL/path we can reference
    assert data not in r.text                          # raw payload never echoed back


def test_upload_reference_hosts_on_higgsfield(real_env):
    import base64
    t = "real_host_hf"
    data = base64.b64encode(b"\x89PNG\r\n fake image bytes").decode()
    r = client.post(f"{B}/influencer/upload-reference", json={
        "tenant_id": t, "image_base64": data, "content_type": "image/png",
        "filename": "face.png", "host": "higgsfield",
    })
    assert r.status_code == 200, r.text
    ident = r.json()["identity"]
    assert ident["reference_hosted"] is True
    # Hosted on Higgsfield's CDN → a fetchable https URL usable as image_url.
    assert ident["reference_ref"] == "https://cdn.higgsfield.ai/uploads/ref.png"
    assert real_env.STATE["last_upload"]["content_type"] == "image/png"
    assert data not in r.text


def test_upload_reference_higgsfield_requires_provider(monkeypatch):
    # Real mode ON but provider NOT configured → higgsfield hosting is refused.
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")
    monkeypatch.delenv("HIGGSFIELD_API_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_KEY", raising=False)
    monkeypatch.delenv("HF_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_VIDEO_MODEL", raising=False)
    import base64
    data = base64.b64encode(b"x").decode()
    r = client.post(f"{B}/influencer/upload-reference", json={
        "tenant_id": "hf_noprov", "image_base64": data, "host": "higgsfield",
    })
    assert r.status_code == 400
    assert r.json()["detail"]["status"] == "provider_not_configured"


def test_upload_reference_rejects_unknown_host(real_env):
    import base64
    data = base64.b64encode(b"x").decode()
    r = client.post(f"{B}/influencer/upload-reference", json={
        "tenant_id": "bad_host", "image_base64": data, "host": "s3",
    })
    assert r.status_code == 422


def test_upload_reference_requires_image_or_ref(real_env):
    r = client.post(f"{B}/influencer/upload-reference", json={"tenant_id": "real_noref"})
    assert r.status_code == 422


def test_upload_reference_accepts_pre_hosted_url(real_env):
    t = "real_prehosted"
    r = client.post(f"{B}/influencer/upload-reference", json={
        "tenant_id": t, "reference_ref": "https://cdn.test/face.png",
    })
    assert r.status_code == 200
    ident = r.json()["identity"]
    assert ident["reference_ref"] == "https://cdn.test/face.png"
    assert ident["reference_hosted"] is False


# --------------------------------------------------------------------------- #
# Generation gating + real async job
# --------------------------------------------------------------------------- #
def test_real_mode_missing_provider_blocks_generation(monkeypatch):
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")
    monkeypatch.delenv("HIGGSFIELD_API_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_KEY", raising=False)
    monkeypatch.delenv("HF_KEY", raising=False)
    monkeypatch.delenv("HIGGSFIELD_VIDEO_MODEL", raising=False)
    t = "real_noprov"
    sid = _ready_for_video(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 400
    assert r.json()["detail"]["status"] == "provider_not_configured"
    # No video row was created (no spend).
    from content_creator.store import get_video_repository
    assert get_video_repository().list(t) == []


def test_no_video_generation_before_production_approval(real_env):
    t = "real_gate3"
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme", "niche": "hvac"})
    client.post(f"{B}/influencer/upload-reference", json={"tenant_id": t, "reference_ref": "https://cdn.test/f.png"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t})
    idea_id = gen.json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})
    s = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id})
    sid = s.json()["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})
    # production NOT approved
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 409 and r.json()["detail"]["gate"] == "production"


def test_submit_creates_generating_job(real_env):
    t = "real_submit"
    sid = _ready_for_video(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 200, r.text
    v = r.json()["video"]
    assert v["status"] == "generating"
    assert v["provider"] == "higgsfield"
    assert v["provider_job_id"] == "req_123"
    assert v["storage_url"] == "" and v["result_url"] == ""
    # image-to-video: the public reference URL was passed as image_url.
    assert real_env.STATE["last_submit"]["arguments"].get("image_url") == "https://cdn.test/face.png"


def test_status_polls_then_completes_and_rehosts(real_env):
    # First poll running, second poll completed.
    real_env.STATE["status_seq"] = [real_env.Queued, real_env.Completed]
    t = "real_poll"
    sid = _ready_for_video(t)
    vid = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()["id"]

    p1 = client.get(f"{B}/videos/{vid}/status", params={"tenant_id": t})
    assert p1.status_code == 200 and p1.json()["video"]["status"] == "generating"

    p2 = client.get(f"{B}/videos/{vid}/status", params={"tenant_id": t})
    v = p2.json()["video"]
    assert v["status"] == "ready"
    assert v["result_url"] == "https://cdn.test/higgs/v.mp4"
    # Re-hosted to durable storage (local provider returns a backend URL).
    assert v["storage_url"] and v["storage_url"] != v["result_url"]


def test_no_silent_mock_fallback_on_provider_error(real_env):
    real_env.STATE["submit"] = RuntimeError("higgsfield 500 boom")
    t = "real_err"
    sid = _ready_for_video(t)
    r = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert r.status_code == 502
    assert r.json()["detail"]["status"] == "provider_error"
    # Crucially: NO mock video was silently produced.
    from content_creator.store import get_video_repository
    assert get_video_repository().list(t) == []


def test_quality_check_requires_completed_video(real_env):
    t = "real_qc"
    sid = _ready_for_video(t)
    vid = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()["id"]
    # Still generating → quality-check refuses.
    r = client.post(f"{B}/videos/{vid}/quality-check", json={"tenant_id": t})
    assert r.status_code == 409 and r.json()["detail"]["status"] == "video_not_ready"


def test_no_publish_before_publish_approval(real_env):
    t = "real_pub"
    sid = _ready_for_video(t)
    vid = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()["id"]
    r = client.post(f"{B}/posts/schedule", json={"tenant_id": t, "video_id": vid})
    assert r.status_code == 409 and r.json()["detail"]["gate"] == "publish"


# --------------------------------------------------------------------------- #
# Opt-in real integration (spends real credits) — skipped by default
# --------------------------------------------------------------------------- #
@pytest.mark.skipif(
    os.getenv("RUN_HIGGSFIELD_INTEGRATION_TESTS") != "1",
    reason="set RUN_HIGGSFIELD_INTEGRATION_TESTS=1 with real HIGGSFIELD_* creds to run",
)
def test_real_higgsfield_connection_live():
    from content_creator.providers.higgsfield import HiggsfieldApiProvider
    prov = HiggsfieldApiProvider()
    result = prov.test_connection()
    assert result["provider"] == "higgsfield"
    assert result["connected"] is True, result
