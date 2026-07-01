"""Pixie runtime-mode layer.

One obvious place that answers: "are we in test mode, and is real execution
allowed right now?" The individual mock flags (PIXIE_MODEL_MODE,
CONTENT_CREATOR_MOCK/DRY_RUN, per-channel ChannelMode) still exist and still
work exactly as before; this package just *aggregates* and *reports* them behind
one flag so every agent has a single source of truth to consult before it does
anything with real-world side effects.
"""

from .mode import (
    AgentMode,
    ExecutionMode,
    agent_mode,
    execution_mode,
    is_test_mode,
    is_mock_execution,
    require_approval,
    real_execution_allowed,
    mode_banner,
)

__all__ = [
    "AgentMode",
    "ExecutionMode",
    "agent_mode",
    "execution_mode",
    "is_test_mode",
    "is_mock_execution",
    "require_approval",
    "real_execution_allowed",
    "mode_banner",
]
