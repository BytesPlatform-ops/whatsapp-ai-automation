"""Pixie General Content Agent — written-content generation.

Separate from:
* ``backend/content`` — the media/asset library (uploads), left untouched.
* ``backend/content_creator`` — the AI Influencer video pipeline, left untouched.

This module generates written content (posts, captions, blogs, emails, ad copy,
product descriptions, SEO content, video scripts, carousels, rewrites) as durable
tenant-scoped documents with version history. Mock/fake by default ($0); the real
model seam (``models`` layer, ``PIXIE_MODEL_MODE=openai``) drops in without a
product redesign.
"""
