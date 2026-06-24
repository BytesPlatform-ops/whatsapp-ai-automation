"""SEO prompt templates — injection-resistant render functions, one per task.

Every render function wraps UNTRUSTED page content in ``<<< >>>`` delimiters and
includes an explicit injection guard so that content inside the delimiters is
treated strictly as data, never as instructions. No secrets/keys live here.
"""

from __future__ import annotations

from .templates import (
    INJECTION_GUARD,
    render_content_suggestions,
    render_image_alt,
    render_keyword_usage,
    render_local_seo,
    render_meta_description,
    render_meta_title,
    render_readability,
)

__all__ = [
    "INJECTION_GUARD",
    "render_meta_title",
    "render_meta_description",
    "render_image_alt",
    "render_content_suggestions",
    "render_readability",
    "render_local_seo",
    "render_keyword_usage",
]
