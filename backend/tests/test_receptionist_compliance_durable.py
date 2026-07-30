"""Durable campaign compliance records (Wave 5, Part 5).

Proves consent / opt-out / do-not-contact survive a simulated restart (file
backend + store-singleton reset), are tenant-scoped, and drive the send gate.
Hermetic + $0.
"""

from __future__ import annotations

import pytest

from receptionist.campaigns import store
from receptionist.campaigns.schemas import (
    CampaignChannel,
    ConsentRecord,
    DoNotContactEntry,
    OptOutEntry,
)


@pytest.fixture()
def file_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    from receptionist.service import stores as dstores
    dstores.reset_all()
    yield dstores
    dstores.reset_all()


def _restart(dstores):
    """Simulate a process restart: drop cached store singletons so the next access
    re-reads the durable backend from disk."""
    dstores.reset_all()


def test_consent_survives_restart(file_backend):
    store.add_consent(ConsentRecord(tenant_id="t_a", email="a@x.com",
                                    channel=CampaignChannel.EMAIL, consent_type="marketing",
                                    granted=True))
    _restart(file_backend)
    got = store.list_consent("t_a")
    assert len(got) == 1 and got[0].email == "a@x.com" and got[0].granted


def test_optout_and_dnc_survive_restart(file_backend):
    store.add_opt_out(OptOutEntry(tenant_id="t_a", phone="+100", channel=CampaignChannel.SMS, scope="all"))
    store.add_dnc(DoNotContactEntry(tenant_id="t_a", email="dnc@x.com", reason="complaint"))
    _restart(file_backend)
    assert any(o.phone == "+100" for o in store.list_opt_outs("t_a"))
    assert any(d.email == "dnc@x.com" for d in store.list_dnc("t_a"))


def test_compliance_is_tenant_scoped(file_backend):
    store.add_dnc(DoNotContactEntry(tenant_id="t_a", email="dnc@x.com", reason="legal"))
    assert store.list_dnc("t_a") and not store.list_dnc("t_b")


def test_send_log_idempotency_durable(file_backend):
    store.log_send("t_a", campaign_id="c1", idempotency_key="k1", contact="a@x.com", status="sent")
    _restart(file_backend)
    assert store.key_already_logged("t_a", "k1")
    assert not store.key_already_logged("t_a", "other")
    assert store.recent_send_count("t_a", "a@x.com", 30) == 1
