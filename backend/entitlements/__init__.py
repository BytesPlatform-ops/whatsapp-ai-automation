"""Pixie Lab entitlements — per-tenant agent access (locked / trial / active).

Gates which agents a tenant can use and drives the upsell ticker + trial/purchase
flow. Trials are time-boxed and never auto-charge; activation happens only after
an explicit purchase (Stripe checkout → webhook). Self-contained, in-memory seam.
"""
