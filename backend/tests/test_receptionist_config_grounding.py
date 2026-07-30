"""Durable, versioned Receptionist configuration + runtime grounding (Wave 5).

Hermetic + $0: PIXIE_PERSIST=memory, fake LLM. Proves the acceptance requirement
that a saved configuration change grounds the very next conversation turn, that
config is versioned, that cross-tenant access is denied, and that a missing value
is never invented.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def test_save_config_creates_versions():
    from receptionist.service import config_repo
    assert config_repo.get_active("t_a") is None
    assert config_repo.missing_required("t_a") == ["business_name", "hours"]

    cfg = config_repo.save("t_a", {"business_name": "Acme", "hours": "Mon-Fri 9-5"}, updated_by="u1")
    assert cfg["config_version"] == 1
    assert config_repo.is_configured("t_a")

    cfg2 = config_repo.save("t_a", {"hours": "Mon-Sun 8-8"}, updated_by="u2")
    assert cfg2["config_version"] == 2
    assert cfg2["business_name"] == "Acme"  # non-empty prior value preserved

    versions = config_repo.list_versions("t_a")
    assert len(versions) == 2
    assert versions[0]["version"] == 2 and versions[0]["status"] == "active"
    assert versions[1]["status"] == "archived"


def test_empty_string_does_not_clobber():
    from receptionist.service import config_repo
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5"})
    cfg = config_repo.save("t_a", {"business_name": ""})
    assert cfg["business_name"] == "Acme"


def test_activate_prior_version_rolls_back():
    from receptionist.service import config_repo
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5", "cancellation_policy": "24h notice"})
    v1 = config_repo.list_versions("t_a")[0]["id"]
    config_repo.save("t_a", {"cancellation_policy": "48h notice"})
    assert config_repo.get_active("t_a")["cancellation_policy"] == "48h notice"

    config_repo.activate_version("t_a", v1)
    assert config_repo.get_active("t_a")["cancellation_policy"] == "24h notice"


def test_onboarding_grounds_next_turn():
    """save opening hours -> ask for opening hours -> AI answers using saved hours."""
    from receptionist.service import config_repo, engine, stores
    stores.reset_all()
    config_repo.save("t_a", {"business_name": "Bright Dental", "hours": "Mon-Fri 8am to 6pm"})

    out = engine.run_message(tenant_id="t_a", message="what are your opening hours?")
    assert "8am to 6pm" in out["reply"] or "Mon-Fri" in out["reply"], out["reply"]


def test_updated_policy_used_next_turn():
    """Update cancellation policy -> next retrieval uses the new version's value."""
    from receptionist.service import config_repo, business_profile, stores
    stores.reset_all()
    config_repo.save("t_a", {"business_name": "Bright Dental", "hours": "9-5",
                             "cancellation_policy": "Cancellations need 24 hours notice"})
    ans1 = business_profile.answer_question("t_a", "what are your cancellations rules?")
    assert ans1 is not None and "24 hours" in ans1["answer"], ans1

    config_repo.save("t_a", {"cancellation_policy": "Cancellations need 48 hours notice"})
    ans2 = business_profile.answer_question("t_a", "what are your cancellations rules?")
    assert ans2 is not None and "48 hours" in ans2["answer"], ans2


def test_missing_value_not_invented():
    """No pricing configured -> FAQ retrieval must not fabricate a price."""
    from receptionist.service import config_repo, business_profile, stores
    stores.reset_all()
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5"})
    ans = business_profile.answer_question("t_a", "how much does a website cost?")
    assert ans is None  # nothing configured about price -> caller must not hallucinate


def test_cross_tenant_config_isolation():
    from receptionist.service import config_repo, stores
    stores.reset_all()
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5"})
    assert config_repo.get_active("t_b") is None
    assert config_repo.missing_required("t_b") == ["business_name", "hours"]


def test_save_profile_routes_through_config_repo():
    from receptionist.service import business_profile, config_repo, stores
    stores.reset_all()
    business_profile.save_profile("t_a", {"business_name": "Acme", "hours": "9-5",
                                          "pricing_notes": "Websites from $500"})
    cfg = config_repo.get_active("t_a")
    assert cfg is not None and cfg["config_version"] >= 1
    assert cfg["prices"] == "Websites from $500"  # pricing_notes mapped to config
    prof = business_profile.get_profile("t_a")
    assert prof["pricing_notes"] == "Websites from $500"
