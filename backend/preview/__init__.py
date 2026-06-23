"""Preview renderer — turns a `Site` into a standalone HTML page for visual QA.

This is NOT the product frontend (that comes later, separately). It's a backend
helper so we can *see* what the generator produced and eyeball whether it looks
bespoke. Pure string templating — no deps, no framework.
"""

from .renderer import render_site

__all__ = ["render_site"]
