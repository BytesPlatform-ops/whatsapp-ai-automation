"""Queue package for the Content Creator pipeline — PURE STDLIB.

Wave 1 ships an in-memory synchronous queue + a local sync runner so the whole
13-stage workflow runs without Redis. The `JobQueue` ABC is the seam an
arq/celery adapter slots behind in a later wave.
"""

from __future__ import annotations

from .jobs import Job, make_job
from .worker import InMemoryQueue, JobQueue
from .sync_runner import run_pipeline

__all__ = ["Job", "make_job", "JobQueue", "InMemoryQueue", "run_pipeline"]
