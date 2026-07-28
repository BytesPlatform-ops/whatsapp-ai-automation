"""Local SEO vertical for the SEO agent.

Subpackages:
  stores        — dataclasses + _AutoRepo repositories + ALL_REPOSITORIES
  locations     — Location CRUD + archive/restore
  gbp           — Google Business Profile OAuth + sync
  reviews       — GBP review workspace + AI response drafting
  nap           — NAP (Name/Address/Phone) consistency auditing
  citations     — Citation sources + listings CRUD + scheduled checks
  local_rank    — Local rank tracking (organic/local-pack/maps positions)
  competitors   — Local competitor tracking + local opportunity engine
  location_pages — Location-page opportunity generator + Content Agent handoff
  schema        — LocalBusiness JSON-LD schema builder + approval gate
  routes        — APIRouter for all Local SEO endpoints

Wire the router in app.py::

    from seo.local.routes import router as local_seo_router
    app.include_router(local_seo_router)
"""

from seo.local import routes  # noqa: F401 (import to register the router)
