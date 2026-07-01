"""Global agent/execution mode — PURE STDLIB, no framework, no network.

Two env knobs sit on top of the mock flags that already exist across the
backend, so the whole system can be reasoned about from one place:

    PIXIE_AGENT_MODE       test | production      (default: test)
    PIXIE_EXECUTION_MODE   mock | open_source | real   (default: mock)
    PIXIE_REQUIRE_APPROVAL 1/0                     (default: 1 / true)

The golden rule this module encodes:

    Real, outward-facing side effects are allowed ONLY when
    agent_mode == production AND execution_mode == real.

Everything else (test mode, or mock/open_source execution) must stay in
dry-run / preview / mock. Agents call `real_execution_allowed()` before doing
anything with real-world consequences; if it returns False they fall back to a
mock/preview result. This does NOT replace the per-module flags
(PIXIE_MODEL_MODE, CONTENT_CREATOR_MOCK, per-channel ChannelMode) — it sits
above them and reports them together via `mode_banner()`.
"""

from __future__ import annotations

import os
from enum import Enum


class AgentMode(str, Enum):
    TEST = "test"
    PRODUCTION = "production"


class ExecutionMode(str, Enum):
    MOCK = "mock"
    OPEN_SOURCE = "open_source"
    REAL = "real"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def agent_mode() -> AgentMode:
    """test (default) or production. Unknown values degrade to the safe 'test'."""
    raw = os.getenv("PIXIE_AGENT_MODE", "test").strip().lower()
    try:
        return AgentMode(raw)
    except ValueError:
        return AgentMode.TEST


def execution_mode() -> ExecutionMode:
    """mock (default), open_source, or real. Unknown values degrade to 'mock'."""
    raw = os.getenv("PIXIE_EXECUTION_MODE", "mock").strip().lower()
    try:
        return ExecutionMode(raw)
    except ValueError:
        return ExecutionMode.MOCK


def is_test_mode() -> bool:
    return agent_mode() is AgentMode.TEST


def is_mock_execution() -> bool:
    return execution_mode() is ExecutionMode.MOCK


def require_approval() -> bool:
    """Whether risky/customer-facing actions must pass the approval gate.

    Defaults to True. In test mode it is ALWAYS True regardless of the env var —
    a testing surface should never silently auto-execute customer-facing work.
    """
    if is_test_mode():
        return True
    return _flag("PIXIE_REQUIRE_APPROVAL", True)


def real_execution_allowed() -> bool:
    """The single guard every agent consults before a real side effect.

    True ONLY when we are explicitly in production AND execution is 'real'.
    Any of {test mode, mock, open_source} → False → caller must mock/preview.
    """
    return agent_mode() is AgentMode.PRODUCTION and execution_mode() is ExecutionMode.REAL


def _content_creator_status() -> dict:
    """Best-effort read of the Content Creator flags without a hard import cycle."""
    try:
        from content_creator.config import status_banner  # local import: pure stdlib module

        return status_banner()
    except Exception:  # never let reporting break the app
        return {}


def mode_banner() -> dict:
    """One dict describing the whole system's safety posture.

    Surfaced at /api/mode and foldable into /health so the dashboard test-mode
    banner ('No real customer action will be executed') can be driven by real
    server state instead of a hardcoded string.
    """
    am = agent_mode()
    em = execution_mode()
    banner_text = (
        "TEST MODE · mock/open-source connectors · no real customer action"
        if am is AgentMode.TEST or not real_execution_allowed()
        else "PRODUCTION · real execution enabled"
    )
    return {
        "banner": banner_text,
        "agent_mode": am.value,
        "execution_mode": em.value,
        "require_approval": require_approval(),
        "real_execution_allowed": real_execution_allowed(),
        # underlying per-module flags, reported (not replaced) for transparency:
        "model_mode": os.getenv("PIXIE_MODEL_MODE", "fake"),
        "content_creator": _content_creator_status(),
    }
