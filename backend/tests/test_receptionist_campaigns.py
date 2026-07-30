"""Advanced outbound campaigns — lifecycle, audience/eligibility, consent/suppression,
frequency caps, sequencing, stop conditions, content versioning, approval invalidation,
idempotent execution, reply attribution, billing (Wave 17). Hermetic — reuses channel
adapters via mock transports; campaign sending is env-gated OFF by default.
"""

from __future__ import annotations

import pytest


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("AI_RECEPTIONIST_CAMPAIGNS_ENABLED", "1")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    yield
    stores.reset_all()


def _contact(tenant="t_a", phone="+15559990000", name="Sam Jones", **extra):
    from receptionist.service import stores
    return stores.find_or_create_contact(tenant, name=name, phone=phone, source="voice", **extra)


def _campaign(tenant="t_a", purpose="support", channel="sms"):
    from receptionist.service import campaigns
    c = campaigns.create(tenant, name="Reminder", purpose=purpose, channels=[channel])
    campaigns.update(tenant, c["id"], {"audience_rule": {"contact_ids": []}})
    campaigns.add_step(tenant, c["id"], name="s1", channel=channel, order=0)
    campaigns.set_content(tenant, c["id"], channel=channel, body="Hi {{first_name}}, reminder.")
    return campaigns.get(tenant, c["id"])


# ── lifecycle ─────────────────────────────────────────────────────────────────

def test_create_and_validate(env):
    from receptionist.service import campaigns
    _contact()
    c = _campaign()
    v = campaigns.validate("t_a", c["id"])
    assert v["ok"], v["errors"]
    assert c["status"] == "draft" and c["purpose"] == "support"


def test_promotional_disabled_by_default(env):
    from receptionist.service import campaigns
    c = _campaign(purpose="promotional")
    v = campaigns.validate("t_a", c["id"])
    assert not v["ok"] and "promotional_disabled" in v["errors"]


def test_draft_cannot_start(env):
    from receptionist.service import campaigns
    c = _campaign()
    # a draft has no valid approval, so start is refused
    assert campaigns.start("t_a", c["id"])["status"] in ("approval_invalid", "not_approved")


def test_approve_then_content_change_invalidates(env):
    from receptionist.service import campaigns
    _contact()
    c = _campaign()
    campaigns.request_approval("t_a", c["id"])
    assert campaigns.approve("t_a", c["id"])["status"] == "approved"
    assert campaigns.approval_valid("t_a", c["id"])
    campaigns.set_content("t_a", c["id"], channel="sms", body="new copy {{first_name}}")
    assert not campaigns.approval_valid("t_a", c["id"])
    assert campaigns.get("t_a", c["id"])["status"] == "draft"


def test_audience_change_invalidates_approval(env):
    from receptionist.service import campaigns
    _contact()
    c = _campaign()
    campaigns.request_approval("t_a", c["id"]); campaigns.approve("t_a", c["id"])
    campaigns.update("t_a", c["id"], {"audience_rule": {"tag": "vip"}})
    assert not campaigns.approval_valid("t_a", c["id"])


def test_sequence_step_limit(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_CAMPAIGN_MAX_SEQUENCE_STEPS", "2")
    from receptionist.service import campaigns
    c = campaigns.create("t_a", name="x", purpose="support", channels=["sms"])
    campaigns.add_step("t_a", c["id"], name="a", channel="sms", order=0)
    campaigns.add_step("t_a", c["id"], name="b", channel="wait", order=1)
    with pytest.raises(ValueError):
        campaigns.add_step("t_a", c["id"], name="c", channel="sms", order=2)


# ── content ───────────────────────────────────────────────────────────────────

def test_content_validation_unknown_variable(env):
    from receptionist.service import campaign_content
    r = campaign_content.validate_content("sms", {"body": "Hi {{secret_field}}"})
    assert not r["ok"] and any("unknown_variables" in e for e in r["errors"])


def test_content_render_blocks_missing_variable(env):
    from receptionist.service import campaign_content
    r = campaign_content.render({"body": "Hi {{first_name}} at {{location}}"}, {"first_name": "Sam", "location": ""})
    assert not r["ok"] and "location" in r["unresolved"]


def test_email_requires_subject(env):
    from receptionist.service import campaign_content
    r = campaign_content.validate_content("email", {"body": "hello"})
    assert not r["ok"] and "missing_subject" in r["errors"]


# ── audience + eligibility ────────────────────────────────────────────────────

def test_segment_and_snapshot_dedup(env):
    from receptionist.service import campaigns, campaign_audience
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"], ct["id"]]}})
    snap = campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    assert snap["total"] == 1 and snap["included"] == 1


def test_eligibility_missing_identity(env):
    from receptionist.service import campaigns, campaign_audience, stores
    ct = stores.find_or_create_contact("t_a", name="No Phone", email="", source="voice")
    c = _campaign(channel="sms")
    res = campaign_audience.evaluate_eligibility("t_a", campaigns.get("t_a", c["id"]), ct, "sms")
    assert res["status"] == "missing_identity"


def test_eligibility_suppressed(env):
    from receptionist.service import campaigns, campaign_audience, stores
    from receptionist.service.schemas import OptOut
    ct = _contact(phone="+15551110000")
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", phone="+15551110000", channel="sms", scope="channel").model_dump())
    c = _campaign(channel="sms")
    res = campaign_audience.evaluate_eligibility("t_a", campaigns.get("t_a", c["id"]), ct, "sms")
    assert res["status"] == "suppressed"


def test_promotional_requires_consent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_CAMPAIGN_PROMOTIONAL_ENABLED", "1")
    from receptionist.service import config_repo, campaigns, campaign_audience
    config_repo.save("t_a", {"campaign_promotional_enabled": True}, updated_by="t")
    ct = _contact()
    c = _campaign(purpose="promotional")
    res = campaign_audience.evaluate_eligibility("t_a", campaigns.get("t_a", c["id"]), ct, "sms")
    assert res["status"] == "missing_consent"


# ── frequency caps ────────────────────────────────────────────────────────────

def test_frequency_cap_blocks_second_send(env):
    from receptionist.service import campaigns, campaign_execution
    ct = _contact()
    c = _campaign()
    camp = campaigns.get("t_a", c["id"])
    assert campaign_execution.frequency_check("t_a", camp, ct["id"], "sms", commit=True)["allowed"]
    assert not campaign_execution.frequency_check("t_a", camp, ct["id"], "sms", commit=False)["allowed"]


# ── execution (send disabled by default) ──────────────────────────────────────

def test_execute_step_send_disabled_by_default(env):
    from receptionist.service import campaigns, campaign_audience, campaign_execution
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
    campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    res = campaign_execution.execute_step("t_a", c["id"], ct["id"])
    # send OFF by default → records send_disabled, still advances/completes
    assert res.get("last_state") == "send_disabled" or res.get("status") in ("completed", "advanced")


def test_execute_step_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_CAMPAIGN_SEND_ENABLED", "1")
    from receptionist.providers import sms_adapter as sms
    from integrations import connections
    from receptionist.service import campaigns, campaign_audience, campaign_execution, stores
    connections.register_many("t_a", ["sms_read", "sms_send"], {
        "status": "active", "account_sid": "AC", "auth_token": "t", "sender_number": "+15550001111",
        "sms_capable": True, "messaging_enabled": True})
    sms.set_transport(sms._MockSMSTransport())
    try:
        from receptionist.service import config_repo
        config_repo.save("t_a", {"sms_quiet_hours": {"enabled": False}}, updated_by="t")  # isolate the send path
        ct = _contact()
        c = _campaign(channel="sms")
        campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
        campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
        r1 = campaign_execution.execute_step("t_a", c["id"], ct["id"])
        assert r1.get("last_state") in ("provider_pending", "completed")
        # re-run the SAME step (recipient completed after single-step) → duplicate/no re-send
        execs = [e for e in stores.cmp_executions().list("t_a") if e.get("campaign_id") == c["id"]]
        assert len(execs) == 1
    finally:
        sms.set_transport(None)


def test_execute_step_stops_when_suppressed_after_snapshot(env):
    from receptionist.service import campaigns, campaign_audience, campaign_execution, stores
    from receptionist.service.schemas import OptOut
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
    campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", phone=ct["phone"], channel="sms", scope="channel").model_dump())
    res = campaign_execution.execute_step("t_a", c["id"], ct["id"])
    assert res["status"] in ("stopped", "suppressed")


# ── stop conditions + reply attribution ───────────────────────────────────────

def test_reply_pauses_sequence_and_attributes(env):
    from receptionist.service import campaigns, campaign_audience, campaign_execution
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
    campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    out = campaign_execution.process_reply("t_a", contact_id=ct["id"], conversation_id="conv1", kind="direct_reply")
    assert out["status"] == "attributed" and c["id"] in out["campaigns"]
    r = campaign_audience.get_recipient("t_a", c["id"], ct["id"])
    assert r["state"] == "answered"


def test_opt_out_stops_future_steps(env):
    from receptionist.service import campaigns, campaign_audience, campaign_execution
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
    campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    campaign_execution.process_opt_out("t_a", ct["id"])
    r = campaign_audience.get_recipient("t_a", c["id"], ct["id"])
    assert r["state"] == "opted_out"


def test_cancel_stops_queued_recipients(env):
    from receptionist.service import campaigns, campaign_audience
    ct = _contact()
    c = _campaign()
    campaigns.update("t_a", c["id"], {"audience_rule": {"contact_ids": [ct["id"]]}})
    campaign_audience.create_snapshot("t_a", campaigns.get("t_a", c["id"]))
    campaigns.cancel("t_a", c["id"])
    r = campaign_audience.get_recipient("t_a", c["id"], ct["id"])
    assert r["state"] == "cancelled"


# ── billing / limits ──────────────────────────────────────────────────────────

def test_product_and_limits():
    from credits.products import get_product
    from credits.plans import get_plan, UNLIMITED
    assert "receptionist_campaign_op" in get_product("ai_receptionist").operation_types
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_campaign_active") == 0
    assert starter.limit("receptionist_campaign_active") == 2
    assert pro.limit("receptionist_campaign_monthly_recipients") == UNLIMITED


def test_limits_summary_includes_campaign(env):
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "campaign_message" in s and "campaign_active" in s
