"""Site-wide SEO analysis: link graph aggregation, cross-page checks, reporting."""

from .link_graph import aggregate_internal_links
from .cross_page import run_cross_page_checks
from .report import build_report

__all__ = [
    "aggregate_internal_links",
    "run_cross_page_checks",
    "build_report",
]
