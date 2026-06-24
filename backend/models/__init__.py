"""Model layer — provider-abstracted, swappable, cheap-first.

    from models import get_router, ModelRequest, ModelResult

`PIXIE_MODEL_MODE=fake` (default) runs with no API key/spend; the same code path
serves a real provider once registered in router.py.
"""

from .base import ModelRequest, ModelResult, Provider, estimate_tokens
from .pricing import cost_for
from .router import ModelRouter, get_router

__all__ = [
    "ModelRequest",
    "ModelResult",
    "Provider",
    "ModelRouter",
    "get_router",
    "cost_for",
    "estimate_tokens",
]
