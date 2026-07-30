"""AI Receptionist billing — reserve → run → settle/release for paid operations.

Thin wrapper over the shared credits engine (``credits.enforcement.enforce``) so
the receptionist attributes usage to the ``ai_receptionist`` product without a
separate wallet. It is a pass-through no-op (zero cost) unless BOTH the credit
system (``CREDIT_SYSTEM_ENABLED``) and the receptionist billing flag
(``AI_RECEPTIONIST_BILLING_ENABLED``) are on. Mock operations, validation failures
and security rejections never reserve, so they cost zero. Reservations are keyed by
``operation_id`` so a duplicate message / job / approval execution charges once, and
a provider retry settles once.
"""

from __future__ import annotations

import os
from typing import Callable, Optional, Tuple

SOURCE_PRODUCT = "ai_receptionist"
FEATURE = "ai_receptionist"

# Conservative per-operation provider-cost ceilings in µUSD (bound the MAX reservation;
# the trusted actual cost is charged at settlement).
_MAX_MICRO_USD = {
    "receptionist_classify": 2_000,
    "receptionist_response_plan": 3_000,
    "receptionist_reply": 6_000,
    "receptionist_summarize": 2_000,
    "receptionist_knowledge_ingest": 5_000,
    "receptionist_knowledge_embed": 4_000,
    "receptionist_knowledge_retrieve": 1_000,
    "receptionist_approval_exec": 1_000,
    "receptionist_worker_op": 2_000,
}
_DEFAULT_MAX_MICRO_USD = 3_000


def billing_enabled() -> bool:
    """Receptionist metering is live only when the flag AND the product are active."""
    flag = os.environ.get("AI_RECEPTIONIST_BILLING_ENABLED", "").strip().lower()
    if flag not in ("1", "true", "yes", "on"):
        return False
    try:
        from credits.products import get_product
        spec = get_product("ai_receptionist")
        return bool(spec and spec.billing_active)
    except Exception:
        return False


def _is_mock() -> bool:
    """LLM operations are mock unless the model router is in a real (openai) mode."""
    try:
        from models import get_router
        return get_router().mode != "openai"
    except Exception:
        return True


def meter(tenant_id: str, operation_type: str, *, operation_id: str,
          run: Callable[[], Tuple[object, int]], max_micro_usd: Optional[int] = None,
          is_mock: Optional[bool] = None, limit_key: str = "", used: int = 0):
    """Reserve (if applicable) → ``run()`` → settle the trusted actual cost.

    ``run`` must return ``(result, actual_provider_micro_usd)``. Returns ``result``.
    When billing is disabled or the op is mock, ``run`` still executes but no hold is
    placed. Raising inside ``run`` releases the hold (unbilled) unless the provider
    already delivered."""
    if is_mock is None:
        is_mock = _is_mock()

    try:
        from credits import config
    except Exception:
        result, _ = run()
        return result

    if not config.credit_system_enabled() or not billing_enabled():
        result, _ = run()
        return result

    from credits import enforcement
    from credits.estimate import build_estimate

    max_micro = max_micro_usd if max_micro_usd is not None else _MAX_MICRO_USD.get(
        operation_type, _DEFAULT_MAX_MICRO_USD)
    est = build_estimate(tenant_id, operation_type=operation_type,
                         max_provider_micro_usd=max_micro, is_mock=is_mock)

    with enforcement.enforce(
        tenant_id, operation_type=operation_type, source_product=SOURCE_PRODUCT,
        source_object_id=operation_id, operation_id=operation_id, estimate=est,
        feature=FEATURE, limit_key=limit_key, used=used, is_mock=is_mock,
    ) as op:
        result, actual_micro = run()
        op.provider_succeeded(int(actual_micro or 0))
    return result


def charge(tenant_id: str, operation_type: str, *, operation_id: str,
           actual_micro_usd: int, is_mock: Optional[bool] = None) -> None:
    """Convenience: meter an operation whose work already happened, charging the
    trusted actual cost. Idempotent on ``operation_id``; mock/disabled → zero."""
    meter(tenant_id, operation_type, operation_id=operation_id,
          run=lambda: (None, actual_micro_usd), is_mock=is_mock)
