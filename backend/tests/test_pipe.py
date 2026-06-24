"""Step 2 — prove the pipe: message → orchestrator → Site → out.

Exercises the real ASGI app via FastAPI's TestClient (no network, no DB) and
asserts tenant scoping, that a metered UsageEvent is emitted, and that business
type steers the output (restaurant vs plumber).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import app

client = TestClient(app)


def _generate(message: str, tenant_id: str = "t_test", **extra):
    body = {"tenant_id": tenant_id, "message": message, **extra}
    resp = client.post("/v1/generate", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_pipe_returns_a_site_scoped_to_tenant():
    data = _generate("build me a cozy italian restaurant site called Trattoria Lucia")
    site = data["site"]
    assert site["tenant_id"] == "t_test"
    assert site["meta"]["brand_name"]
    assert len(site["sections"]) >= 2
    # first section is a hero with at least one CTA (benefit-led, not lorem)
    hero = site["sections"][0]
    assert hero["type"] == "hero"
    assert hero["ctas"]


def test_usage_event_emitted_with_latency():
    data = _generate("make a plumber website")
    usage = data["usage"]
    assert usage["events"], "expected at least one UsageEvent"
    ev = usage["events"][0]
    assert ev["tenant_id"] == "t_test"
    assert ev["event_type"] in {"build", "edit"}
    assert ev["latency_ms"] >= 0
    assert "cost_usd" in usage and "latency_ms" in usage


def test_business_type_steers_output():
    resto = _generate("italian restaurant with a menu")["site"]
    plumber = _generate("24/7 emergency plumber, call now")["site"]
    resto_types = {s["type"] for s in resto["sections"]}
    plumber_types = {s["type"] for s in plumber["sections"]}
    assert "menu" in resto_types
    assert "menu" not in plumber_types
    # palettes differ (not one default blue for everyone)
    assert resto["palette"]["primary"] != plumber["palette"]["primary"]


def test_palette_is_not_default_blue():
    site = _generate("a studio website")["site"]
    assert site["palette"]["primary"].lower() not in {"#2563eb", "#3b82f6", "#0000ff"}
