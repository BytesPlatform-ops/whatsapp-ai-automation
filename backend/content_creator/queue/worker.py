"""Queue worker seam — PURE STDLIB.

`JobQueue` is the abstract surface (`enqueue` + `run_next`). Wave 1 provides only
`InMemoryQueue` (a plain list, FIFO). A durable arq/celery/redis adapter slots in
behind this same ABC later — the orchestrator and API only ever see `JobQueue`,
so swapping the backend is a one-line wiring change with no core edits.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from ..enums import JobStatus
from .jobs import Job


class JobQueue(ABC):
    """Abstract pipeline job queue.

    Implementations: `InMemoryQueue` (Wave 1). Later: an arq/celery adapter that
    pushes jobs onto Redis and runs them in a worker process — same two methods.
    """

    @abstractmethod
    def enqueue(self, job: Job) -> None:
        """Add a job to the queue."""

    @abstractmethod
    def run_next(self) -> Optional[dict]:
        """Pop and run the next job; return a result dict, or None if empty."""


class InMemoryQueue(JobQueue):
    """Synchronous, in-process FIFO queue. No Redis, no threads."""

    def __init__(self) -> None:
        self._jobs: List[Job] = []

    def enqueue(self, job: Job) -> None:
        job.status = JobStatus.QUEUED.value
        self._jobs.append(job)

    def pending(self) -> int:
        return len(self._jobs)

    def run_next(self) -> Optional[dict]:
        if not self._jobs:
            return None
        job = self._jobs.pop(0)
        job.status = JobStatus.DONE.value
        return {
            "tenant_id": job.tenant_id,
            "stage": job.stage,
            "status": job.status,
            "payload": job.payload,
        }
