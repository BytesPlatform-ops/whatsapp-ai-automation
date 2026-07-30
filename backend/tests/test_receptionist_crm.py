"""External CRM marketplace — adapters, connection, OAuth state, capabilities,
import, incremental sync, dedup, mapping, conflicts, outbound writes, compliance
(Wave 18). Hermetic — mock provider transports; NO live CRM calls/imports/writes.
"""

from __future__ import annotations

import pytest


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("AI_RECEPTIONIST_CRM_MARKETPLACE_ENABLED", "1")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections, webhook_events
    from receptionist.providers import crm
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections(); crm.clear_transports()
    try: webhook_events._reset_repos()
    except Exception: pass
    yield
    stores.reset_all(); crm.clear_transports()


def _connect(provider="hubspot", tenant="t_a"):
    from receptionist.service import crm_marketplace
    return crm_marketplace.connect(tenant, provider, access_token="tok", account_id=f"{provider}_acct_1")


# ── catalog + adapters ────────────────────────────────────────────────────────

def test_catalog_has_all_five(env):
    from receptionist.providers.crm import catalog, PROVIDERS
    ids = {c["provider"] for c in catalog()}
    assert ids == {"gohighlevel", "hubspot", "salesforce", "pipedrive", "zoho"}
    assert set(PROVIDERS) == ids


def test_adapters_are_distinct_and_replaceable(env):
    from receptionist.providers.crm import get_adapter
    assert get_adapter("hubspot").CAP_KEY == "crm_hubspot"
    assert get_adapter("salesforce").OBJECT_MAP["deal"] == "Opportunity"
    assert get_adapter("pipedrive").OBJECT_MAP["contact"] == "persons"


def test_injected_transport_overrides_mock(env):
    from receptionist.providers import crm
    from receptionist.providers.crm.mock import MockCRMTransport
    crm.set_transport("zoho", MockCRMTransport("zoho", capabilities=["contacts_read"], account_name="Injected"))
    _connect("zoho")
    assert crm.get_adapter("zoho").get_account("t_a")["name"] == "Injected"


# ── connection + security ─────────────────────────────────────────────────────

def test_connect_defaults_safe(env):
    r = _connect()
    assert r["status"] == "connected"
    from receptionist.service import crm_marketplace
    s = crm_marketplace.status("t_a", "hubspot")
    assert s["state"] == "sync_paused" and s["write"] is False and s["sync_direction"] == "import_only"


def test_credentials_not_leaked_in_status(env):
    from integrations import connections
    from receptionist.service import crm_marketplace
    connections.register_many("t_a", ["crm_hubspot"], {"status": "active", "provider": "hubspot",
                                                      "access_token": "SECRET_TOK", "account_id": "a1",
                                                      "capabilities": ["contacts_read"]})
    import json
    assert "SECRET_TOK" not in json.dumps(crm_marketplace.status("t_a", "hubspot"))


def test_oauth_state_signed_and_single_use(env):
    from receptionist.service import crm_marketplace
    st = crm_marketplace.oauth_start("t_a", "hubspot")["state"]
    v = crm_marketplace.verify_oauth_state(st)
    assert v["tenant_id"] == "t_a" and v["provider"] == "hubspot"
    assert crm_marketplace.verify_oauth_state(st) is None  # replay rejected
    assert crm_marketplace.verify_oauth_state(st + "x") is None  # forged rejected


def test_capabilities_discovered(env):
    _connect()
    from receptionist.service import crm_marketplace
    caps = crm_marketplace.discover_capabilities("t_a", "hubspot")["capabilities"]
    assert "contacts_read" in caps and "webhooks" in caps


# ── import + incremental ──────────────────────────────────────────────────────

def test_initial_import_bounded_and_resumable(env):
    _connect()
    from receptionist.service import crm_sync, stores
    r = crm_sync.initial_import("t_a", "hubspot", "contact")
    assert r["status"] == "completed" and r["imported"] == 3  # two-page fixture, deduped by record id
    # re-run is idempotent (checkpoint completed)
    assert crm_sync.initial_import("t_a", "hubspot", "contact")["status"] == "already_completed"
    assert stores.contacts().count("t_a") >= 1


def test_incremental_sync_advances_cursor(env):
    _connect()
    from receptionist.service import crm_sync, stores
    r = crm_sync.incremental_sync("t_a", "hubspot")
    assert r["status"] == "ok" and r["cursor"] == "cur_next"


def test_cursor_recovery_bounded(env):
    _connect()
    from receptionist.service import crm_sync
    assert crm_sync.recover_cursor("t_a", "hubspot")["status"] == "ok"


# ── dedup + mapping ───────────────────────────────────────────────────────────

def test_dedup_by_email(env):
    _connect()
    from receptionist.service import stores, crm_mapping
    stores.find_or_create_contact("t_a", name="Sam", email="sam1@example.com", source="web")
    rec = {"provider": "hubspot", "object_type": "contact", "record_id": "hs_c_1", "version": "v1",
           "fields": {"email": "sam1@example.com", "first_name": "Sam"}, "custom_fields": {}}
    assert crm_mapping.match_contact("t_a", "hubspot", rec)["status"] == "exact_email"


def test_no_auto_merge_on_name(env):
    _connect()
    from receptionist.service import stores, crm_mapping
    stores.find_or_create_contact("t_a", name="Sam Jones", email="other@example.com", source="web")
    rec = {"provider": "hubspot", "object_type": "contact", "record_id": "hs_c_2", "version": "v1",
           "fields": {"first_name": "Sam", "last_name": "Jones", "email": "different@example.com"}, "custom_fields": {}}
    # name matches but email/phone differ → new_contact, never auto-merge
    assert crm_mapping.match_contact("t_a", "hubspot", rec)["status"] == "new_contact"


def test_multiple_candidates_opens_conflict(env):
    _connect()
    from receptionist.service import stores, crm_sync
    stores.find_or_create_contact("t_a", name="A", email="dup@example.com", source="web")
    stores.find_or_create_contact("t_a", name="B", phone="+15550009999", source="web")
    rec = {"provider": "hubspot", "object_type": "contact", "record_id": "hs_c_3", "version": "v1",
           "fields": {"email": "dup@example.com", "phone": "+15550009999"}, "custom_fields": {}}
    out = crm_sync.ingest_record("t_a", "hubspot", rec)
    assert out["status"] == "conflict"
    assert any(c["kind"] == "multiple_candidates" for c in crm_sync.list_conflicts("t_a"))


def test_field_type_validation(env):
    _connect()
    from receptionist.service import crm_mapping
    fm = crm_mapping.set_field_mapping("t_a", "hubspot", "contact", provider_field_id="cf1",
                                       provider_field_name="budget", provider_field_type="number",
                                       canonical_field="email")
    assert fm["validation"] == "type_incompatible"


def test_pipeline_stage_explicit_only(env):
    _connect()
    from receptionist.service import crm_mapping
    crm_mapping.set_pipeline_mapping("t_a", "hubspot", external_pipeline_id="hubspot_pl_1",
                                     canonical_pipeline_id="pl_main", stage_map={"s_won": "closed_won"})
    assert crm_mapping.map_stage("t_a", "hubspot", "hubspot_pl_1", "s_won") == "closed_won"
    assert crm_mapping.map_stage("t_a", "hubspot", "hubspot_pl_1", "s_unknown") is None  # unmapped stays unmapped


# ── compliance ────────────────────────────────────────────────────────────────

def test_import_does_not_grant_consent(env):
    _connect()
    from receptionist.service import crm_sync, stores
    rec = {"provider": "hubspot", "object_type": "contact", "record_id": "hs_c_9", "version": "v1",
           "fields": {"email": "new@example.com", "first_name": "New"}, "custom_fields": {}}
    crm_sync.ingest_record("t_a", "hubspot", rec)
    # no consent record created for an imported contact
    assert all(row.get("source", "").startswith("crm") is False or not row.get("granted")
               for row in stores.consent().list("t_a")) or stores.consent().count("t_a") == 0


def test_crm_cannot_remove_suppression(env):
    _connect()
    from receptionist.service import stores, crm_sync
    from receptionist.service.schemas import OptOut
    c = stores.find_or_create_contact("t_a", name="X", email="sup@example.com", source="web")
    stores.suppression().put("t_a", OptOut(tenant_id="t_a", contact_id=c["id"], channel="sms", scope="channel").model_dump())
    rec = {"provider": "hubspot", "object_type": "contact", "record_id": "hs_c_s", "version": "v1",
           "fields": {"email": "sup@example.com"}, "custom_fields": {"unsub": False}}
    crm_sync.ingest_record("t_a", "hubspot", rec)
    assert stores.suppression().count("t_a") == 1  # suppression preserved, never removed


# ── conflicts ─────────────────────────────────────────────────────────────────

def test_conflict_resolution_protects_compliance(env):
    _connect()
    from receptionist.service import stores, crm_sync
    stores.crm_conflicts().put("t_a", {"id": "cf1", "tenant_id": "t_a", "provider": "hubspot",
                                       "object_type": "contact", "state": "open",
                                       "detail": {"fields": ["suppressed"]}})
    res = crm_sync.resolve_conflict("t_a", "cf1", resolution="external_selected")
    assert res["status"] == "blocked" and res["reason"] == "compliance_field_protected"


def test_conflict_resolution_ok(env):
    _connect()
    from receptionist.service import stores, crm_sync
    stores.crm_conflicts().put("t_a", {"id": "cf2", "tenant_id": "t_a", "provider": "hubspot",
                                       "object_type": "contact", "state": "open", "detail": {"fields": ["email"]}})
    assert crm_sync.resolve_conflict("t_a", "cf2", resolution="pixie_selected")["status"] == "resolved"


# ── outbound writes ───────────────────────────────────────────────────────────

def test_outbound_write_disabled_by_default(env):
    _connect()
    from receptionist.service import crm_sync
    res = crm_sync.outbound_write("t_a", "hubspot", canonical_type="contact", canonical_id="c1",
                                  trigger="new_lead", payload={"email": "x@e.com"})
    assert res["status"] == "write_disabled"


def test_outbound_write_when_enabled_idempotent(env, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_CRM_EXTERNAL_WRITE_ENABLED", "1")
    monkeypatch.setenv("AI_RECEPTIONIST_CRM_BIDIRECTIONAL_ENABLED", "1")
    _connect()
    from receptionist.service import crm_marketplace, crm_sync
    crm_marketplace.set_sync_direction("t_a", "hubspot", "bidirectional")
    r1 = crm_sync.outbound_write("t_a", "hubspot", canonical_type="contact", canonical_id="c1",
                                 trigger="new_lead", payload={"email": "x@e.com"})
    assert r1["status"] == "written" and r1["external_id"]
    r2 = crm_sync.outbound_write("t_a", "hubspot", canonical_type="contact", canonical_id="c1",
                                 trigger="new_lead", payload={"email": "x@e.com"})
    assert r2["status"] == "duplicate"


# ── billing / limits ──────────────────────────────────────────────────────────

def test_product_and_limits(env):
    from credits.products import get_product
    from credits.plans import get_plan, UNLIMITED
    assert "receptionist_crm_op" in get_product("ai_receptionist").operation_types
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_crm_connections") == 0
    assert starter.limit("receptionist_crm_connections") == 1
    assert starter.limit("receptionist_crm_monthly_outbound_writes") == 0  # writes off on Starter
    assert pro.limit("receptionist_crm_monthly_imported") == UNLIMITED


def test_limits_summary_includes_crm(env):
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "crm_connection" in s and "crm_outbound_write" in s
