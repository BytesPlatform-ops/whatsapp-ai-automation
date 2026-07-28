"""SEO Reporting package — PDF generation + unified report export.

Public surface:
  from seo.reporting.assembler import assemble_report
  from seo.reporting.pdf import render_pdf
  from seo.reporting.store import GeneratedReportRepository, get_generated_report_repository
  from seo.reporting.routes import router

Report kinds:
  technical_audit       — technical health + issues
  search_performance    — GSC / GA4 traffic summaries
  keyword_ranking       — keyword rankings + history
  competitor            — competitor comparison
  backlink              — backlink profile
  local_seo             — local SEO, GBP, citations, reviews
  executive             — all sections combined

PDF generation uses reportlab only (no HTML rendering, no remote asset fetch).
PDF generation is NOT metered by default (local computation, no API cost).
"""

from seo.reporting.assembler import assemble_report  # noqa: F401
from seo.reporting.pdf import render_pdf              # noqa: F401

REPORT_KINDS = (
    "technical_audit",
    "search_performance",
    "keyword_ranking",
    "competitor",
    "backlink",
    "local_seo",
    "executive",
)
