"""Marketing Business Profile — storage seam.

The profile is the data the Brain reads before generating anything. This package
ships the in-memory repository; the durable Prisma/Supabase implementation
(see the ``MarketingProfile`` model in /prisma/schema.prisma) plugs in behind the
same method surface in a later wave.
"""

from __future__ import annotations

from .repository import InMemoryProfileRepository, get_profile_repository

__all__ = ["InMemoryProfileRepository", "get_profile_repository"]
