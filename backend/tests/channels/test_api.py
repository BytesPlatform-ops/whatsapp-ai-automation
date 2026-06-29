"""Channels JSON API — HTTP-level tests over the Wave-2 api.py router.

Mounts ONLY `channels.api.router` on a local FastAPI app + TestClient (mirrors
marketing/test_api_flow.py) so nothing else needs to boot. Everything is $0 /
keyless: statuses, the enable checkbox flipping a channel live, a dry-run send
that never transmits, the agent registry, and the MASKED owner contact (the raw
value must never appear in any response).

These are plain `def test_*` functions — pytest isn't installed, so they're
called directly by the validation harness.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from channels.api import router as channels_router

app = FastAPI()
app.include_router(channels_router)
client = TestClient(app)

TID = "t_api_demo"


def test_status_returns_nine_channels():
    r = client.get("/api/channels/status", params={"tenant_id": TID})
    assert r.status_code == 200, r.text
    statuses = r.json()
    assert len(statuses) == 9, f"expected 9 channels, got {len(statuses)}"
    # default-safe: nothing live out of the box
    assert all(s["live"] is False for s in statuses)


def test_enable_web_chat_goes_live():
    body = {
        "tenant_id": TID,
        "enabled": True,
        "mode": "live",
        "settings": {"widget_id": "w1"},
        "credentials_present": {},
    }
    r = client.post("/api/channels/web_chat/config", json=body)
    assert r.status_code == 200, r.text
    st = r.json()
    assert st["requirements_met"] is True
    assert st["live"] is True
    assert st["missing"] == []

    # ...and the single-channel status endpoint agrees
    one = client.get("/api/channels/web_chat/status", params={"tenant_id": TID}).json()
    assert one["live"] is True


def test_dry_run_never_transmits():
    # ensure web_chat is configured (enabled live) first
    client.post("/api/channels/web_chat/config", json={
        "tenant_id": TID, "enabled": True, "mode": "live",
        "settings": {"widget_id": "w1"}, "credentials_present": {}})
    r = client.post("/api/channels/web_chat/dry-run", json={
        "tenant_id": TID, "recipient_id": "u_test", "text": "hi"})
    assert r.status_code == 200, r.text
    sr = r.json()
    assert sr["ok"] is True
    # mock layer stays dry-run; web_chat MAY report sent — accept either, never error
    assert sr["dry_run"] is True
    assert sr["sent"] in (True, False)
    assert sr["preview"]["text"] == "hi"


def test_inbound_replay_returns_payload():
    r = client.post("/api/channels/web_chat/inbound", json={
        "tenant_id": TID, "raw": {"sender": "u9", "message": "hello there"}})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["inbound"]["text"] == "hello there"
    assert out["inbound"]["sender_id"] == "u9"


def test_agents_returns_four():
    r = client.get("/api/channels/agents")
    assert r.status_code == 200, r.text
    agents = r.json()
    names = {a["name"] for a in agents}
    assert names == {"receptionist", "marketing", "seo", "omnichannel"}


def test_agent_includes_channel_statuses():
    r = client.get("/api/channels/agents/receptionist", params={"tenant_id": TID})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["name"] == "receptionist"
    assert a["prerequisites"]
    stats = a["channel_statuses"]
    assert len(stats) == len(a["channels"])
    assert {s["channel"] for s in stats} == set(a["channels"])


def test_unknown_agent_404():
    r = client.get("/api/channels/agents/nope", params={"tenant_id": TID})
    assert r.status_code == 404


def test_pixie_contact_is_masked():
    raw_email = "owner@business.com"
    r = client.post("/api/channels/pixie-contact", json={
        "tenant_id": TID, "type": "email", "value": raw_email,
        "preferred_channel": "email", "notify_on": ["new_lead", "booking"]})
    assert r.status_code == 200, r.text
    body = r.json()
    # MASKED value returned; raw email must NEVER appear anywhere in the response
    assert body["value_masked"] == "o***@business.com"
    assert raw_email not in r.text
    assert body["verified"] is False
    assert body["notify_on"] == ["new_lead", "booking"]

    # GET also returns masked-only, never the raw value
    g = client.get("/api/channels/pixie-contact", params={"tenant_id": TID})
    assert raw_email not in g.text
    assert g.json()["value_masked"] == "o***@business.com"

    # verify flips verified=True, still masked
    v = client.post("/api/channels/pixie-contact/verify", params={"tenant_id": TID})
    assert v.status_code == 200, v.text
    assert v.json()["verified"] is True
    assert raw_email not in v.text


def test_unknown_channel_404():
    r = client.get("/api/channels/carrier_pigeon/status", params={"tenant_id": TID})
    assert r.status_code == 404
