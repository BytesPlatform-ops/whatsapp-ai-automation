"""Marketing platform layer — strategy specs + provider-agnostic adapters.

Pure deterministic. NO AI model is called anywhere in this package. Adapters are
dry-run placeholders: nothing publishes live.

Public API:
    Strategy:   PlatformSpec, PLATFORM_SPECS, get_platform_spec, list_platform_specs
    Contract:   PlatformAdapter, BasePlaceholderAdapter, SupportLevel,
                PostContent, DryRunResult
    Registry:   ADAPTERS, get_adapter
"""

from __future__ import annotations

from .adapters import ADAPTERS, get_adapter
from .base import (
    BasePlaceholderAdapter,
    DryRunResult,
    PlatformAdapter,
    PostContent,
    SupportLevel,
)
from .strategy import (
    PLATFORM_SPECS,
    PlatformSpec,
    get_platform_spec,
    list_platform_specs,
)

__all__ = [
    # strategy
    "PlatformSpec",
    "PLATFORM_SPECS",
    "get_platform_spec",
    "list_platform_specs",
    # contract / base classes
    "PlatformAdapter",
    "BasePlaceholderAdapter",
    "SupportLevel",
    "PostContent",
    "DryRunResult",
    # registry
    "ADAPTERS",
    "get_adapter",
]
