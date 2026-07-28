"""Durable rank-tracking vertical for the Pixie SEO agent.

Subpackage layout:
  service.py   — run_rank_check(): create RankJob, call provider per keyword,
                 write RankSnapshots, update Keyword ranks, meter, summarise.
  scheduler.py — claim_due_jobs() / run_claimed_job(): job locking, retry/backoff,
                 restart-recovery of expired-lock RUNNING jobs.
  analytics.py — computed analytics from stored snapshots: winners/losers,
                 rank buckets, SERP-feature changes, competitor comparison, etc.
  routes.py    — FastAPI router mounted at /api/agents/seo (prefix already set
                 on seo_agent_router; this router uses the same prefix so the
                 caller just includes it alongside agent_routes).
"""

from seo.rank.service import run_rank_check
from seo.rank.scheduler import claim_due_jobs, run_claimed_job
from seo.rank.analytics import (
    rank_history,
    rank_overview,
    keyword_detail,
)

__all__ = [
    "run_rank_check",
    "claim_due_jobs",
    "run_claimed_job",
    "rank_history",
    "rank_overview",
    "keyword_detail",
]
