"""Stage model + run state for the Content Creator pipeline — PURE STDLIB.

`PipelineState` is the deterministic, framework-free object the sync runner and
orchestrator pass through every stage. It holds plain dicts for each artifact so
the core needs no Pydantic; the demo/API layer maps it to Pydantic at the edge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..enums import (
    ApprovalGate,
    ApprovalStatus,
    GATE_BLOCKS_STAGE,
    PipelineStage,
    STAGE_SEQUENCE,
)

# Human-facing metadata for the 13-stage progress bar.
STAGE_META = {
    PipelineStage.INTAKE: {"n": 1, "title": "Business intake", "gate": None},
    PipelineStage.INFLUENCER_SETUP: {"n": 2, "title": "Influencer setup", "gate": None},
    PipelineStage.PROVIDER_CONNECTION: {"n": 3, "title": "Provider connection", "gate": None},
    PipelineStage.IDEA_GENERATION: {"n": 4, "title": "Idea generation", "gate": None},
    PipelineStage.IDEA_APPROVAL: {"n": 5, "title": "Gate 1 · Idea approval", "gate": ApprovalGate.IDEA.value},
    PipelineStage.SCRIPT_GENERATION: {"n": 6, "title": "Script generation", "gate": None},
    PipelineStage.SCRIPT_APPROVAL: {"n": 7, "title": "Gate 2 · Script approval", "gate": ApprovalGate.SCRIPT.value},
    PipelineStage.COST_ESTIMATE: {"n": 8, "title": "Cost estimate · Gate 3 production", "gate": ApprovalGate.PRODUCTION.value},
    PipelineStage.VIDEO_GENERATION: {"n": 9, "title": "Video generation", "gate": None},
    PipelineStage.QUALITY_CHECK: {"n": 10, "title": "Quality check", "gate": None},
    PipelineStage.PUBLISH_APPROVAL: {"n": 11, "title": "Gate 4 · Publish approval", "gate": ApprovalGate.PUBLISH.value},
    PipelineStage.POSTING: {"n": 12, "title": "Posting", "gate": None},
    PipelineStage.ANALYTICS: {"n": 13, "title": "Analytics + learning", "gate": None},
}


def stage_index(stage: PipelineStage) -> int:
    return STAGE_SEQUENCE.index(stage)


def next_stage(stage: PipelineStage) -> Optional[PipelineStage]:
    i = stage_index(stage)
    return STAGE_SEQUENCE[i + 1] if i + 1 < len(STAGE_SEQUENCE) else None


def gate_blocking(stage: PipelineStage) -> Optional[ApprovalGate]:
    """The gate that must be APPROVED before `stage` may run (or None)."""
    for gate, blocked in GATE_BLOCKS_STAGE.items():
        if blocked == stage:
            return gate
    return None


def progress_view() -> List[dict]:
    """Ordered stage descriptors for the demo progress bar."""
    return [
        {"stage": s.value, "n": STAGE_META[s]["n"], "title": STAGE_META[s]["title"], "gate": STAGE_META[s]["gate"]}
        for s in STAGE_SEQUENCE
    ]


@dataclass
class PipelineState:
    """Everything one tenant's content run accumulates. Plain dicts inside."""

    tenant_id: str
    stage: PipelineStage = PipelineStage.INTAKE
    profile: dict = field(default_factory=dict)
    identity: dict = field(default_factory=dict)
    provider: dict = field(default_factory=dict)
    ideas: List[dict] = field(default_factory=list)
    script: dict = field(default_factory=dict)
    cost_estimate: dict = field(default_factory=dict)
    video: dict = field(default_factory=dict)
    quality: dict = field(default_factory=dict)
    posts: List[dict] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    learning: dict = field(default_factory=dict)
    # gate -> ApprovalStatus value
    approvals: Dict[str, str] = field(
        default_factory=lambda: {g.value: ApprovalStatus.PENDING.value for g in ApprovalGate}
    )
    logs: List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "tenant_id": self.tenant_id,
            "stage": self.stage.value,
            "stage_n": STAGE_META[self.stage]["n"],
            "profile": self.profile,
            "identity": self.identity,
            "provider": self.provider,
            "ideas": self.ideas,
            "script": self.script,
            "cost_estimate": self.cost_estimate,
            "video": self.video,
            "quality": self.quality,
            "posts": self.posts,
            "metrics": self.metrics,
            "learning": self.learning,
            "approvals": self.approvals,
            "logs": self.logs,
        }
