"""Boot-time configuration summary + guardrails for the content services.

Logs a SECRET-FREE summary of the runtime modes (persistence / AI / posting /
provider / storage) so the logs make it obvious whether the box is durable and
whether real spend is possible. Never prints keys, secrets, or credentials.

Guardrail: set ``PIXIE_REQUIRE_DURABLE=1`` (do this in production) so the process
refuses to boot on in-memory persistence — which silently loses Content Creator
pipeline state on restart. Off by default, so tests and local dev keep using
memory without ceremony. This keeps persistence mode independent of AI mock mode:
mock generation ($0) can still run on durable persistence.

Guardrail: set ``PIXIE_REQUIRE_INTERNAL_SECRET=1`` (do this in production) so the
process refuses to boot without ``PIXIE_INTERNAL_API_SECRET`` set. When the flag is
OFF (the default) the check is a no-op so tests and local dev work without a secret.
"""

from __future__ import annotations

import logging
import os

import persistence
from content_creator import config

log = logging.getLogger("pixie.startup")


class StartupConfigError(RuntimeError):
    """Raised at boot when required configuration is not correctly set."""


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes", "on")


def validate_internal_secret() -> None:
    """Fail fast when the internal secret is required but not configured.

    Honoured flags (either forces the check): ``PIXIE_REQUIRE_INTERNAL_SECRET``
    (whole backend) and ``AI_RECEPTIONIST_REQUIRE_INTERNAL_SECRET`` (receptionist-
    specific, so the receptionist can demand proxy-only access independently).
    When both are OFF (tests / local dev) this is a no-op. NEVER logs the secret
    value — only its presence is checked.
    """
    if not (_truthy("PIXIE_REQUIRE_INTERNAL_SECRET")
            or _truthy("AI_RECEPTIONIST_REQUIRE_INTERNAL_SECRET")):
        return
    secret = os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip()
    if not secret:
        raise StartupConfigError(
            "An internal-secret requirement flag is set but PIXIE_INTERNAL_API_SECRET "
            "is empty or unset. Set PIXIE_INTERNAL_API_SECRET to a strong random value "
            "so the backend only accepts requests from the trusted Next.js proxy."
        )


def validate_receptionist_config() -> None:
    """Fail fast on an unsafe AI Receptionist production configuration.

    When ``AI_RECEPTIONIST_REQUIRE_DURABLE`` is set, the receptionist refuses to
    boot on in-memory persistence (conversations / leads / bookings would be lost
    on restart). Off by default so tests and local dev keep using memory.
    """
    if _truthy("AI_RECEPTIONIST_REQUIRE_DURABLE") and not persistence.enabled():
        raise StartupConfigError(
            "AI_RECEPTIONIST_REQUIRE_DURABLE is set but PIXIE_PERSIST is 'memory'. "
            "Set PIXIE_PERSIST=supabase (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) "
            "so receptionist conversations, leads and bookings survive restarts."
        )
    # Fail closed when token encryption is required but no valid key is available,
    # so receptionist Gmail/Calendar/Meta tokens are never stored insecurely.
    from integrations import token_crypto
    token_crypto.assert_token_encryption_ready()


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
    validate_internal_secret()
    validate_receptionist_config()
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
