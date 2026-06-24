"""Creative-brief generator for the Pixie Marketing AI Agent.

``generate_brief(BriefRequest) -> CreativeBrief``: AI provides the creative
direction (via the model router, task="marketing_brief") with a deterministic
fallback so it's always functional and $0 in fake mode. Spec fields
(aspect_ratio, duration, editing_pace, asset_checklist) are always deterministic.
"""

from __future__ import annotations

from .generator import generate_brief
from .schemas import BriefRequest, CreativeBrief, PixieVideoFormat

__all__ = [
    "generate_brief",
    "BriefRequest",
    "CreativeBrief",
    "PixieVideoFormat",
]
