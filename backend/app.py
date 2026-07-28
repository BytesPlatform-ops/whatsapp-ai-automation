"""Pixie backend — FastAPI entry point.

Step 2 exposes the generation pipe: POST /v1/generate takes a plain-language
`Request` and returns the produced `Site` plus a `usage` envelope (latency, cost,
per-step events) so cost-per-request is visible from the very first call.
"""

from __future__ import annotations

import os
from pathlib import Path


def _load_local_env() -> None:
    """Load backend/.env into os.environ (dependency-free) so local runs pick up
    config without exporting vars or passing uvicorn --env-file. Existing
    environment variables always win, so real deploy env is never overridden."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    try:
        for raw in env_path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except Exception:
        pass  # never block startup on a malformed .env


_load_local_env()

from fastapi import FastAPI
from pydantic import BaseModel, Field

from activity.router import router as activity_router
from approvals.router import router as approvals_router
from channels.api import router as channels_router
from entitlements.router import router as entitlements_router
from feed.router import router as feed_router
from pixie_units.router import router as pixie_units_router
from runtime.mode import mode_banner
from runtime.router import router as mode_router
from omni import router as omni_router
from orchestrator import Orchestrator
from receptionist.api import router as receptionist_router
from receptionist.agent_api import agent_router as ai_receptionist_router
from receptionist.agent_api import integrations_router
from receptionist.console_api import console_router as ai_receptionist_console_router
from integrations.oauth_routes import router as google_oauth_router
from meta.oauth_routes import router as meta_connect_router
from meta.routes import agent_router as meta_agent_router
from meta.routes import meta_data_router
from meta.ads_routes import router as meta_ads_router
from meta.brand_routes import router as meta_brand_router
from meta.planner_routes import router as meta_planner_router
from content.routes import router as content_router
from seo.agent_routes import router as seo_agent_router
from seo.google.routes import router as seo_google_router
from seo.keywords.project_routes import router as keyword_router
from seo.rank.routes import router as seo_rank_router
from seo.intelligence.routes import router as seo_intelligence_router
from seo.fix_verify_routes import router as seo_fix_verify_router
from seo.backlinks.routes import router as seo_backlinks_router
from seo.scheduler.routes import router as seo_scheduler_router
from seo.reporting.routes import router as seo_pdf_router
from seo.outreach.routes import router as seo_outreach_router
from seo.local.routes import router as seo_local_router
from receptionist.campaigns.api import router as campaigns_router
from receptionist.onboarding.api import router as onboarding_router
from content_creator.router import router as content_creator_router
from content_agent.routes import router as content_agent_router
from credits.routes import billing_router, stripe_webhook_router
from publishing.routes import publishing_router, social_router
from schemas import Request, Site, UsageEvent
from seo.router import router as seo_router

app = FastAPI(title="Pixie Backend", version="0.2.0")

# ── Internal shared-secret hardening ─────────────────────────────────────────
# The backend has no user auth of its own; in production it must only be reachable
# by the trusted Next.js proxy. When PIXIE_INTERNAL_API_SECRET is set, every
# request must carry a matching `X-Pixie-Internal-Secret` header — EXCEPT the
# public endpoints below, which browsers / Meta / Google call directly (a browser
# redirect can't attach the header). When the secret is unset the check is a
# no-op, so local dev works without it; SET IT IN PRODUCTION.
from starlette.responses import JSONResponse  # noqa: E402

_PUBLIC_PATHS = {
    "/", "/health", "/docs", "/openapi.json", "/redoc",
    "/api/meta/connect/start", "/api/meta/connect/callback", "/api/meta/webhooks",
    "/api/integrations/google/connect", "/api/integrations/google/callback",
}


def _is_public(path: str) -> bool:
    return path in _PUBLIC_PATHS or path.startswith("/docs") or path.startswith("/redoc")


@app.middleware("http")
async def _require_internal_secret(request, call_next):
    # Read the secret live (not captured at import) so tests can toggle it per-case
    # via monkeypatch.setenv and the value is always current. NEVER log its value.
    _secret = os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip()
    if _secret and not _is_public(request.url.path):
        if request.headers.get("x-pixie-internal-secret", "") != _secret:
            return JSONResponse({"detail": "unauthorized: missing/invalid internal secret"}, status_code=401)
    response = await call_next(request)
    # Flag the deprecated in-memory SEO API (Mode A/B). The durable product API is
    # /api/agents/seo/*. Kept for backward compatibility only.
    p = request.url.path
    if p.startswith("/api/seo/") or p == "/api/seo":
        response.headers["Deprecation"] = "true"
        response.headers["Link"] = '</api/agents/seo>; rel="successor-version"'
    return response


app.include_router(receptionist_router)
app.include_router(ai_receptionist_router)  # /api/agents/ai-receptionist — real OpenAI + approval slice
app.include_router(ai_receptionist_console_router)  # /api/agents/ai-receptionist/* — durable console: CRM, bookings, quotes, tasks, tickets, payments, knowledge, analytics
app.include_router(integrations_router)  # /api/integrations/status — capability readiness
app.include_router(google_oauth_router)  # /api/integrations/google/* — real Gmail/Calendar OAuth connect
app.include_router(meta_connect_router)  # /api/meta/connect|assets|status — Meta OAuth + asset discovery
app.include_router(meta_agent_router)  # /api/agents/marketing/meta/* — Meta Marketing Agent
app.include_router(meta_data_router)  # /api/meta/analytics|ads|webhooks — Meta insights (read-only)
app.include_router(meta_ads_router)  # /api/meta/ad-accounts|campaigns|insights — Meta Ads Marketing API
app.include_router(meta_brand_router)  # /api/meta/brand-brain — Brand Brain from old posts
app.include_router(meta_planner_router)  # /api/meta/ideas|calendar — Idea Curator + Content Calendar
app.include_router(content_router)  # /api/content/assets — media upload (Supabase Storage)
app.include_router(seo_agent_router)  # /api/agents/seo — platform-aware audit + one-tap optimize
app.include_router(seo_google_router)  # /api/agents/seo/google/* — GSC + GA4 connect/sync/views
app.include_router(keyword_router)  # /api/agents/seo/keywords/* — projects, research, clustering
app.include_router(seo_rank_router)  # /api/agents/seo/rank/* — durable rank tracking
app.include_router(seo_intelligence_router)  # /api/agents/seo/* — competitors, opportunities, briefs, alerts
app.include_router(seo_fix_verify_router)  # /api/agents/seo/fix-verify/* — durable fix verification
app.include_router(seo_backlinks_router)  # /api/agents/seo/backlinks/* — backlink profile, risk, gaps
app.include_router(seo_scheduler_router)  # /api/agents/seo/scheduler/* — internal scheduler admin
app.include_router(seo_pdf_router)  # /api/agents/seo/reports/pdf/* — safe PDF report export
app.include_router(seo_outreach_router)  # /api/agents/seo/outreach/* — outreach contacts/campaigns
app.include_router(seo_local_router)  # /api/agents/seo/* — local SEO, GBP, reviews, citations
app.include_router(onboarding_router)
app.include_router(campaigns_router)
app.include_router(seo_router, deprecated=True)  # DEPRECATED /api/seo/* (in-memory); use /api/agents/seo/*
app.include_router(content_creator_router)
app.include_router(content_agent_router)  # /api/content-agent — General Content Agent (written content generation)
app.include_router(social_router)  # /api/social — connected publishing destinations + capabilities
app.include_router(publishing_router)  # /api/publishing — publish jobs, calendar, history (dry-run default)
app.include_router(billing_router)  # /api/billing — wallet, reservations, estimates (credit system OFF by default)
app.include_router(stripe_webhook_router)  # /api/billing/webhook — Stripe events (public; signature-verified)
app.include_router(channels_router)  # /api/channels — agent/channel readiness for the dashboard
app.include_router(feed_router)  # /api/feed — Pixie Lab proactive recommendation feed
app.include_router(entitlements_router)  # /api/entitlements — agent trial/purchase gating
app.include_router(approvals_router)  # /api/approvals — risky-action approval gate
app.include_router(activity_router)  # /api/activity — tenant activity log
app.include_router(pixie_units_router)  # /api/agents/{slug}/trial + /api/omni/trial
app.include_router(mode_router)  # /api/mode — global test/execution mode + safety banner
app.include_router(omni_router)  # /api/omni — signal routing brain (Test Lab)


class UsageSummary(BaseModel):
    latency_ms: int
    cost_usd: float
    events: list[UsageEvent]


class GenerateResponse(BaseModel):
    """Response envelope — the agent reply, the Site, and what it cost to make it."""

    reply: str = Field(default="", description="One short friendly line from the agent.")
    site: Site
    usage: UsageSummary = Field(..., description="Latency + cost + per-step usage events.")


@app.on_event("startup")
async def _content_config_startup() -> None:
    # Secret-free boot summary of persistence / AI / posting / provider modes, and
    # a fail-fast when PIXIE_REQUIRE_DURABLE is set but persistence is in-memory.
    from startup_checks import log_content_config

    log_content_config()

    # Fail fast when Google/GBP token encryption is REQUIRED (SEO_REQUIRE_TOKEN_ENCRYPTION=1)
    # but unavailable — a misconfigured production deploy must not silently store
    # obfuscated (non-encrypted) OAuth tokens. No-op in dev/tests (flag unset).
    from seo.google.crypto import assert_token_encryption_ready

    assert_token_encryption_ready()

    # Publishing worker — opt-in (PUBLISH_WORKER_ENABLED). Dry-run by default; a
    # no-op when disabled. Runs in a daemon thread, not the browser.
    from publishing.worker import start_worker

    start_worker()

    # SEO crawl sweeper — re-claims stale/queued crawl jobs after a restart.
    # Skipped under pytest (PYTEST_CURRENT_TEST is set by pytest itself) and
    # when SEO_SWEEPER_DISABLED=1 so integration tests stay hermetic.
    _start_seo_sweeper()

    # SEO scheduler runtime — durable due-job loop (GSC/GA4/rank/alerts/crawl-recovery/
    # fix-verify …). Off by default; SEO_SCHEDULER_ENABLED=1 to enable. Skipped under
    # pytest. Single daemon thread with per-instance ownership + job-level locks.
    from seo.scheduler.startup import start_scheduler

    start_scheduler()


@app.on_event("shutdown")
async def _seo_scheduler_shutdown() -> None:
    from seo.scheduler.startup import stop_scheduler

    stop_scheduler()


def _start_seo_sweeper() -> None:
    """Start a lightweight background sweeper that re-claims stale SEO crawl jobs.

    The sweeper is a daemon thread that wakes every SEO_SWEEPER_INTERVAL_S
    seconds (default 60), finds any queued or stale-running jobs, and calls
    poll_once to re-process them.  This ensures jobs survive a process restart.

    Guards
    ------
    - Not started under pytest: PYTEST_CURRENT_TEST env var is set by pytest.
    - Not started when SEO_SWEEPER_DISABLED=1 (set in tests or staging).
    - Never logs secrets; only logs job counts and worker IDs.
    """
    import os
    import threading
    import time
    import uuid as _uuid
    import logging as _logging

    _logger = _logging.getLogger("seo.sweeper")

    # Safety guards — do NOT run under pytest or when explicitly disabled.
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    if os.getenv("SEO_SWEEPER_DISABLED", "").strip().lower() in ("1", "true", "yes"):
        return

    interval_s = int(os.getenv("SEO_SWEEPER_INTERVAL_S", "60"))

    def _sweep():
        from seo.crawler.worker import poll_once
        from seo.stores import get_crawl_job_repository, CrawlStatus

        worker_id = f"sweeper-{_uuid.uuid4().hex[:8]}"
        _logger.info("seo.sweeper: started (interval=%ds worker=%s)", interval_s, worker_id)

        while True:
            try:
                time.sleep(interval_s)
                # Find all tenants with pending/stale jobs and re-process them.
                # In memory mode the repo is a flat dict; in supabase mode the
                # sweeper just tries every known tenant from the job list.
                repo = get_crawl_job_repository()
                # Collect unique tenant_ids from all stored jobs.
                try:
                    # Access the raw rows from the underlying persistence layer.
                    # This works for memory/file backends; supabase would expose
                    # the same interface.  The sweeper is best-effort — if the
                    # repo doesn't expose a cross-tenant scan we skip.
                    all_rows = repo._repo.list_all() if hasattr(repo._repo, "list_all") else []
                except Exception:
                    all_rows = []

                tenants_seen: set = set()
                for row in all_rows:
                    tid = (row.get("data") or {}).get("tenant_id") or row.get("tenant_id")
                    status = (row.get("data") or {}).get("status", "")
                    if tid and status in (CrawlStatus.QUEUED.value, CrawlStatus.RUNNING.value):
                        tenants_seen.add(tid)

                for tenant_id in tenants_seen:
                    try:
                        processed = poll_once(worker_id, tenant_id)
                        if processed:
                            _logger.info(
                                "seo.sweeper: recovered job for tenant=%s", tenant_id
                            )
                    except Exception as exc:
                        _logger.warning(
                            "seo.sweeper: error processing tenant=%s: %s", tenant_id, exc
                        )
            except Exception as exc:
                _logger.warning("seo.sweeper: sweep cycle error: %s", exc)

    t = threading.Thread(target=_sweep, daemon=True, name="seo-sweeper")
    t.start()


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model_mode": os.getenv("PIXIE_MODEL_MODE", "fake"), "mode": mode_banner()}


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(request: Request) -> GenerateResponse:
    """Build (or, later, edit) a site from a plain-language message."""
    outcome = await Orchestrator().handle(request)
    return GenerateResponse(
        reply=outcome.reply,
        site=outcome.site,
        usage=UsageSummary(
            latency_ms=outcome.latency_ms,
            cost_usd=outcome.cost_usd,
            events=outcome.recorder.events,
        ),
    )
