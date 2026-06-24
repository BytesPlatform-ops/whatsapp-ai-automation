"""The Brain — the reasoning layer (the ONLY place AI runs in marketing).

It reads the business profile + the matching industry preset + any past
performance, then produces the fixed ``BrainStrategy`` contract that every other
module consumes. Nothing repetitive happens here — formatting, scheduling and the
rest are deterministic services elsewhere.
"""

from __future__ import annotations

from .brain import Brain, BrainOutcome, get_brain

__all__ = ["Brain", "BrainOutcome", "get_brain"]
