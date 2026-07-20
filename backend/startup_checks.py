"""Boot-time configuration summary + guardrails for the content services.

Logs a SECRET-FREE summary of the runtime modes (persistence / AI / posting /
provider / storage) so the logs make it obvious whether the box is durable and
whether real spend is possible. Never prints keys, secrets, or credentials.

Guardrail: set ``PIXIE_REQUIRE_DURABLE=1`` (do this in production) so the process
refuses to boot on in-memory persistence — which silently loses Content Creator
pipeline state on restart. Off by default, so tests and local dev keep using
memory without ceremony. This keeps persistence mode independent of AI mock mode:
mock generation ($0) can still run on durable persistence.
"""

from __future__ import annotations

import logging
import os

import persistence
from content_creator import config

log = logging.getLogger("pixie.startup")


class StartupConfigError(RuntimeError):
    """Raised at boot when required durable persistence is not configured."""


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def content_config_summary() -> dict:
    """Secret-free view of the content-service runtime configuration."""
    p = persistence.status()
    return {
        "persistence": p["backend"],
        "durable": p["durable"],
        "multi_instance": p["multi_instance"],
        "supabase_configured": p["supabase_configured"],
        "ai_model_mode": config.model_mode(),
        "content_creator_mock": config.mock_mode(),
        "dry_run_posting": config.dry_run_posting(),
        "video_provider": config.provider_name(),
        "video_provider_configured": config.higgsfield_configured(),
        "storage_provider": os.getenv("PIXIE_STORAGE_PROVIDER", "supabase"),
        "require_durable": _truthy("PIXIE_REQUIRE_DURABLE"),
    }


def validate_content_config() -> dict:
    """Fail fast on an unsafe production configuration; return the summary."""
    s = content_config_summary()
    if s["require_durable"] and not s["durable"]:
        raise StartupConfigError(
            "PIXIE_REQUIRE_DURABLE is set but PIXIE_PERSIST is 'memory'. Set "
            "PIXIE_PERSIST=supabase (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) so "
            "Content Creator pipeline state survives restarts."
        )
    # PIXIE_PERSIST=supabase without creds → the existing clear error, not a silent
    # fallback to memory.
    persistence.require_supabase()
    return s


def log_content_config() -> dict:
    """Validate + emit the boot summary (secret-free). Called once at app startup."""
    s = validate_content_config()
    log.info(
        "[content] persistence=%s durable=%s ai_mock=%s dry_run_posting=%s "
        "video_provider=%s(configured=%s) storage=%s",
        s["persistence"], s["durable"], s["content_creator_mock"], s["dry_run_posting"],
        s["video_provider"], s["video_provider_configured"], s["storage_provider"],
    )
    if not s["durable"]:
        log.warning(
            "[content] persistence is IN-MEMORY — Content Creator pipeline state is lost on "
            "restart. Set PIXIE_PERSIST=supabase for production (and PIXIE_REQUIRE_DURABLE=1 "
            "to enforce it)."
        )
    return s
