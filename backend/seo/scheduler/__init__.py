"""seo.scheduler — production scheduler runtime for the SEO agent.

Provides a single-daemon-thread scheduler that polls registered job sources,
claims jobs atomically, and executes them with bounded concurrency.

Public API
----------
from seo.scheduler.runtime  import SeoScheduler
from seo.scheduler.registry import register_job_source, get_registry
from seo.scheduler.queries  import due_jobs, claim_job
from seo.scheduler.startup  import start_scheduler, stop_scheduler
from seo.scheduler.routes   import router          # FastAPI router
"""

from seo.scheduler.runtime import SeoScheduler
from seo.scheduler.registry import register_job_source, get_registry
from seo.scheduler.startup import start_scheduler, stop_scheduler

__all__ = [
    "SeoScheduler",
    "register_job_source",
    "get_registry",
    "start_scheduler",
    "stop_scheduler",
]
