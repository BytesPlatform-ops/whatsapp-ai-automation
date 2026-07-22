"""Pixie publishing engine — durable, tenant-scoped social publish jobs.

Turns a Content Agent version or an approved AI Influencer post package into a
durable publish job, runs it through a locked worker, and publishes via a
platform adapter. Dry-run by default (no live API call); live is opt-in and never
a silent fallback. Reuses the existing Meta OAuth / token storage
(``meta.token_service`` + ``integrations.connections``) — no second OAuth system.
"""
