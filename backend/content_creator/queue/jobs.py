"""Job model for the pipeline queue — PURE STDLIB.

A `Job` is the unit an async worker would pick up: "run `stage` for `tenant_id`".
Plain dataclass with primitive fields so it serializes cleanly onto any future
broker (arq/celery) without coupling the core to it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..enums import JobStatus, PipelineStage


@dataclass
class Job:
    tenant_id: str
    stage: str
    status: str = JobStatus.QUEUED.value
    payload: dict = field(default_factory=dict)


def make_job(tenant_id: str, stage) -> Job:
    """Build a QUEUED job. `stage` may be a PipelineStage or its `.value`."""
    stage_value = stage.value if isinstance(stage, PipelineStage) else str(stage)
    return Job(tenant_id=tenant_id, stage=stage_value)
