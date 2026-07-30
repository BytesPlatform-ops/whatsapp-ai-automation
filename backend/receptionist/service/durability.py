"""Production durability guard for the AI Receptionist (Wave 5, Part 6).

When ``AI_RECEPTIONIST_REQUIRE_DURABLE`` is set, the receptionist must NOT run on
the in-memory backend (data would be lost on restart and is not multi-instance
safe). :func:`check_durability` raises so a misconfigured production deploy fails
fast instead of silently writing to volatile memory or unmanaged JSON.
"""

from __future__ import annotations

import os

import persistence


class ReceptionistDurabilityError(RuntimeError):
    pass


def durability_required() -> bool:
    return os.environ.get("AI_RECEPTIONIST_REQUIRE_DURABLE", "").strip().lower() in (
        "1", "true", "yes", "on")


def check_durability() -> None:
    """Raise if durability is required but persistence resolves to memory.

    file/supabase are accepted (supabase is the production target; file is durable
    single-instance for local dev). No-op when the flag is off."""
    if not durability_required():
        return
    backend = persistence.backend()
    if backend == "memory":
        raise ReceptionistDurabilityError(
            "AI_RECEPTIONIST_REQUIRE_DURABLE is set but PIXIE_PERSIST resolves to "
            "'memory'. Receptionist data would be lost on restart and is not "
            "multi-instance safe. Set PIXIE_PERSIST=supabase (production) or "
            "PIXIE_PERSIST=file (local dev)."
        )
    # In supabase mode, the credentials must actually be present.
    persistence.require_supabase()
