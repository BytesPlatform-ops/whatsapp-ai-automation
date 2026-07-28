"""SEO Intelligence vertical — competitors, opportunities, optimise workspace,
content briefs, content handoff, and alerts.

All submodules are pure SEO-analysis layer; they consume stored/crawled data
and produce actionable intelligence without calling any external provider
directly. AI-assisted calls are optional, metered, and deterministic (mocked)
in tests.

Public surface: ``seo.intelligence.routes.router`` — an APIRouter mounted at
``/api/agents/seo`` (same prefix as the existing seo agent_routes router, so
app.py includes_both via separate include_router calls or by composing them
into a shared parent).
"""

from .routes import router  # noqa: F401 — re-exported for app.py

__all__ = ["router"]
