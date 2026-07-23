"""Connected social-account plan limit — enforced at the Meta OAuth finalize point,
no-op unless billing enforcement is enabled."""

from __future__ import annotations

import pytest

from credits import enforcement, ledger, service, wallet


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED"]:
        monkeypatch.delenv(k, raising=False)
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    yield
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()


def _set_plan(tenant, plan_id):
    wallet.get_wallet_repository().set_plan_period(tenant, plan_id=plan_id, period_start="", period_end="")


def test_no_op_when_enforcement_disabled():
    # free plan connected_accounts=1, but disabled → never blocks
    enforcement.check_connected_accounts("ws_A", current=5)  # no raise


def test_free_plan_allows_first_account(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _set_plan("ws_A", "free")   # limit 1
    enforcement.check_connected_accounts("ws_A", current=0)  # first account → ok


def test_free_plan_blocks_second_account(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _set_plan("ws_A", "free")   # limit 1
    with pytest.raises(service.CreditError) as ei:
        enforcement.check_connected_accounts("ws_A", current=1)
    assert ei.value.code == "usage_limit_reached" and ei.value.http_status == 402


def test_pro_plan_allows_more_accounts(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _set_plan("ws_A", "pro")    # limit 10
    enforcement.check_connected_accounts("ws_A", current=9)  # ok
    with pytest.raises(service.CreditError):
        enforcement.check_connected_accounts("ws_A", current=10)


def test_route_blocks_when_over_limit(monkeypatch):
    """The Meta /assets/defaults finalize enforces the limit via the helper."""
    pytest.importorskip("fastapi")
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _set_plan("ws_A", "free")
    from publishing import connections
    monkeypatch.setattr(connections, "list_accounts",
                        lambda t: [{"platform": "facebook"}, {"platform": "facebook"}])  # 2 pages
    from meta.oauth_routes import _enforce_connected_account_limit
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as ei:
        _enforce_connected_account_limit("ws_A")
    assert ei.value.status_code == 402
