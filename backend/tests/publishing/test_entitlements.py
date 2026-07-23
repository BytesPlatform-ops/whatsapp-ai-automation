"""Publishing plan entitlements — backend-enforced, behind flags, zero credits."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import publishing.store as pstore
from credits import ledger, reservations, wallet
from publishing import service
from publishing.enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from publishing.schemas import CreatePublishJobBody

FB = {"connection_id": "facebook:PAGE1", "platform": "facebook", "account_id": "PAGE1",
      "page_id": "PAGE1", "display_name": "Page", "scopes": ["pages_manage_posts", "pages_show_list"]}


def _resolver(t, c):
    return FB if c == "facebook:PAGE1" else None


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED"]:
        monkeypatch.delenv(k, raising=False)
    pstore.reset_repositories()
    wallet.reset_wallet_repository()
    ledger.reset_ledger_repository()
    reservations.reset_reservation_repository()
    yield
    pstore.reset_repositories()
    wallet.reset_wallet_repository()


def _set_plan(tenant, plan_id):
    wallet.get_wallet_repository().set_plan_period(tenant, plan_id=plan_id, period_start="", period_end="")


def _body(tenant="ws_A", **kw):
    base = dict(tenant_id=tenant, source_product=SourceProduct.CONTENT_AGENT, connection_id="facebook:PAGE1",
                platform=Platform.FACEBOOK, content_format=ContentFormat.TEXT, text="hi",
                document_id="d1", version_id="v1", mode=PublishMode.DRY_RUN)
    base.update(kw)
    return CreatePublishJobBody(**base)


def _enable(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")


def test_disabled_flags_preserve_behaviour():
    # no flags → dry-run content publish works exactly as before
    jid, job = service.create_job(_body(), account_resolver=_resolver)
    assert job.status is PublishStatus.QUEUED


def test_free_plan_blocks_live_publishing(monkeypatch):
    _enable(monkeypatch)
    _set_plan("ws_A", "free")
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver)
    assert ei.value.category == "feature_not_entitled" and ei.value.http_status == 402


def test_pro_plan_passes_live_entitlement(monkeypatch):
    _enable(monkeypatch)
    _set_plan("ws_A", "pro")
    # live entitlement passes; live is still globally disabled → different error, not entitlement
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver)
    assert ei.value.category == "live_disabled"  # got PAST the entitlement gate


def test_scheduled_job_limit_enforced_on_free_plan(monkeypatch):
    _enable(monkeypatch)
    _set_plan("ws_A", "free")  # scheduled_jobs limit = 3
    for i in range(3):
        service.create_job(_body(scheduled_local=f"2099-0{i+1}-01T09:00", timezone="UTC"),
                           account_resolver=_resolver)
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(scheduled_local="2099-06-01T09:00", timezone="UTC"), account_resolver=_resolver)
    assert ei.value.category == "usage_limit_reached"


def test_publishing_consumes_no_credits(monkeypatch):
    _enable(monkeypatch)
    _set_plan("ws_A", "pro")
    service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="UTC"), account_resolver=_resolver)
    # entitlement gates only — no ledger/wallet movement
    assert wallet.balances("ws_A") == (0, 0)
