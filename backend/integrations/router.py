"""Integration router — capability → connector resolution + status reporting.

Resolution rule (the mental model: "connect it → it goes real"):
  - TEST mode            → always mock (the Test Lab never touches real tools).
  - PRODUCTION + a real connection exists for the capability → REAL connector.
  - PRODUCTION, no connection, execution_mode=real → blocked (missing_connection).
  - PRODUCTION, no connection, execution_mode=mock → mock (safe default).
  - lead_storage / follow_up are internal → always their mock/internal path.

`execute_action` resolves then runs. `integration_status` reports what each
capability would do right now, for the dashboard.
"""

from __future__ import annotations

from typing import Callable, Optional

from runtime.mode import execution_mode, is_test_mode

from . import connectors as C
from .connections import find_active_connection
from meta import connectors as _meta

# capability -> connectors. real_fn takes (payload, connection).
_CAPABILITY_MAP: dict[str, dict] = {
    "email_send": {
        "mock": ("mock_email", C.mock_email_send),
        "real": ("gmail", C.real_gmail_send),
    },
    "calendar_create_event": {
        "mock": ("mock_calendar", C.mock_calendar_create),
        "real": ("google_calendar", C.real_calendar_create),
    },
    "lead_storage": {  # internal — always the CRM
        "mock": ("internal_crm", C.mock_crm_store),
        "internal": True,
    },
    "follow_up": {  # no real connector — always mock, never blocks
        "mock": ("mock_follow_up", C.mock_follow_up),
        "always_mock": True,
    },
    # ── Meta (Facebook/Instagram) — connect Meta → real Graph publish/reply ────
    "meta_content_publish": {
        "mock": ("mock_meta", _meta.mock_meta_publish),
        "real": ("meta", _meta.real_meta_publish),
    },
    "meta_reel_publish": {
        "mock": ("mock_meta", _meta.mock_meta_publish),
        "real": ("meta", _meta.real_meta_publish),
    },
    "meta_comment_reply": {
        "mock": ("mock_meta", _meta.mock_meta_reply),
        "real": ("meta", _meta.real_meta_comment_reply),
    },
}

CAPABILITIES = list(_CAPABILITY_MAP.keys())


class Resolution:
    """The outcome of resolving a capability to something runnable (or not)."""

    def __init__(self, capability: str, *, mode: str, provider: str,
                 run: Optional[Callable[[dict], dict]], status: str) -> None:
        self.capability = capability
        self.mode = mode          # "mock" | "real"
        self.provider = provider
        self.run = run            # callable(payload)->dict, or None if blocked
        self.status = status      # mock_available | active | ready | missing_connection

    def is_blocked(self) -> bool:
        return self.run is None


def _mock(capability: str, spec: dict, status: str) -> Resolution:
    provider, fn = spec["mock"]
    return Resolution(capability, mode="mock", provider=provider, run=fn, status=status)


def resolve_connector(tenant_id: str, capability: str) -> Resolution:
    spec = _CAPABILITY_MAP.get(capability)
    if spec is None:
        return Resolution(capability, mode="mock", provider="unknown", run=None, status="unsupported")

    if spec.get("internal"):
        return _mock(capability, spec, "active")
    if spec.get("always_mock"):
        return _mock(capability, spec, "mock_available")

    # Test mode is always safe — never reach for a real tool.
    if is_test_mode():
        return _mock(capability, spec, "mock_available")

    # Production: a real connection means we go real.
    connection = find_active_connection(tenant_id, capability)
    if connection is not None:
        provider, real_fn = spec["real"]
        bound = lambda payload, _conn=connection: real_fn(payload, _conn)  # noqa: E731
        return Resolution(capability, mode="real", provider=provider, run=bound, status="ready")

    # No connection. In explicit real mode, fail closed; otherwise mock.
    if execution_mode().value == "real":
        return Resolution(capability, mode="real", provider=spec["real"][0], run=None,
                          status="missing_connection")
    return _mock(capability, spec, "mock_available")


def execute_action(tenant_id: str, capability: str, payload: dict) -> dict:
    """Resolve + run one action. Returns a connector result dict (never raises)."""
    res = resolve_connector(tenant_id, capability)
    if res.is_blocked():
        return {
            "status": "blocked",
            "capability": capability,
            "provider": res.provider,
            "mode": res.mode,
            "error": res.status,
            "message": (
                f"Cannot execute '{capability}': {res.status}. "
                "Connect the tool from the dashboard, or switch PIXIE_EXECUTION_MODE=mock."
            ),
        }
    result = res.run(payload)
    result.setdefault("capability", capability)
    result.setdefault("mode", res.mode)
    return result


def integration_status(tenant_id: str, agent_slug: str = "ai-receptionist") -> list[dict]:
    """Per-capability status for the dashboard (what would happen right now)."""
    out = []
    for cap in CAPABILITIES:
        res = resolve_connector(tenant_id, cap)
        out.append({
            "capability": cap,
            "status": res.status,
            "provider": res.provider,
            "mode": res.mode,
        })
    return out
