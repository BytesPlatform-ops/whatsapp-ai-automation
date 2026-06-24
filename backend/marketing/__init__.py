"""Pixie Marketing AI Agent.

A self-contained marketing module that lives entirely under ``backend/marketing/``
so it never collides with Ali's generation / receptionist work on the shared
branch. The split that defines the whole module:

* **The Brain** (``brain/``) is the ONLY place AI runs — strategy, creative
  direction, audience insight. It emits a fixed STRUCTURED contract that every
  other module consumes.
* Everything repetitive (formatting, scheduling, UTM, dedup, reports) is
  deterministic and must never call a model.

Persistence mirrors the SEO module: an in-memory ``repository`` seam today,
backed by the additive ``Marketing*`` Prisma models in ``/prisma/schema.prisma``
(Supabase Postgres) in a later wave — same method surface, no router changes.

Handoffs (SEO, receptionist, sales) CALL existing interfaces; this module never
edits them.
"""

from __future__ import annotations

__all__ = ["__version__"]

__version__ = "0.1.0"  # Wave 1: schemas + Brain contract + Profile + Knowledge presets
