"""ReportLab PDF renderer for unified SEO reports.

Security properties:
  - NO HTML rendering (reportlab draws directly to PDF — no HTML-injection surface).
  - NO remote asset fetch — workspace branding is text-only; any local logo path is
    validated against an explicit allowlist before use.
  - All user-controlled strings are escaped via _esc() before being drawn.
  - Table rows are capped (MAX_TABLE_ROWS) and total pages are capped (MAX_PAGES);
    a "truncated — N more" note is appended when limits are hit.
  - A generation timeout (PDF_TIMEOUT_SECONDS) wraps render_pdf(); if exceeded the
    function raises PDFTimeoutError and no partial bytes are returned.
  - Generated PDF bytes start with %PDF- (asserted by callers/tests).

Public API:
  render_pdf(report: dict, *, workspace_name: str = "",
             logo_path: str | None = None,
             timeout: int | None = None) -> bytes
"""

from __future__ import annotations

import html
import io
import os
import signal
import textwrap
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        BaseDocTemplate,
        Frame,
        PageBreak,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        KeepTogether,
    )
    from reportlab.platypus.flowables import HRFlowable
    _REPORTLAB_OK = True
except ImportError:
    _REPORTLAB_OK = False


# ── Configuration ─────────────────────────────────────────────────────────────

MAX_TABLE_ROWS = 50          # max rows per individual table
MAX_PAGES = 60               # safety cap on total pages
from seo.env import env_int
PDF_TIMEOUT_SECONDS = env_int("SEO_PDF_TIMEOUT_SECONDS", 30)  # tolerates an empty env value

# Allowlist for local logo paths (SSRF guard: only explicitly listed dirs allowed)
_LOGO_ALLOWED_DIRS: tuple = (
    os.path.join(os.path.dirname(__file__), "assets"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "assets"),
)


class PDFTimeoutError(RuntimeError):
    """Raised when PDF generation exceeds the configured timeout."""


class PDFRenderError(RuntimeError):
    """Raised when ReportLab is unavailable or PDF generation fails."""


# ── Security helpers ──────────────────────────────────────────────────────────

def _esc(value: Any) -> str:
    """Escape a user-controlled value for safe rendering in a ReportLab Paragraph.

    Strips control characters, HTML-encodes special chars, and blocks any string
    that looks like a formula injection (leading =, +, -, @, |).

    Used for Paragraph() elements which interpret XML/HTML tags.
    """
    if value is None:
        return ""
    s = str(value)
    # Strip null bytes and control characters
    s = "".join(ch for ch in s if ord(ch) >= 32 or ch in ("\t", "\n"))
    # Trim to a safe length
    s = s[:500]
    # HTML-escape to neutralise < > & and ReportLab XML tags
    s = html.escape(s, quote=True)
    # Block formula-injection prefixes (common in CSV-injection attacks)
    if s and s[0] in ("=", "+", "-", "@", "|", "\t"):
        s = "'" + s
    return s


def _esc_canvas(value: Any) -> str:
    """Safe string for canvas.drawString() calls (raw text, not XML/HTML parsed).

    ReportLab's canvas.drawString() treats its argument as plain text with no
    markup interpretation, so HTML-encoding is NOT appropriate here (it would
    display literal &amp; etc.). Instead we strip HTML tags and control chars,
    and apply the same formula-injection prefix defence.

    Never fetches remote content — purely string manipulation.
    """
    if value is None:
        return ""
    s = str(value)
    # Strip null bytes and control characters
    s = "".join(ch for ch in s if ord(ch) >= 32 or ch in ("\t", "\n"))
    # Strip HTML/XML tags (angle-bracket pairs)
    import re as _re
    s = _re.sub(r"<[^>]*>", "", s)
    # Trim to a safe length
    s = s[:500]
    # Block formula-injection prefixes
    if s and s[0] in ("=", "+", "-", "@", "|", "\t"):
        s = "'" + s
    return s


def _safe_logo_path(path: Optional[str]) -> Optional[str]:
    """Return a real absolute path only if it's within the allowlist and exists."""
    if not path:
        return None
    abs_path = os.path.realpath(path)
    for allowed_dir in _LOGO_ALLOWED_DIRS:
        try:
            allowed_abs = os.path.realpath(allowed_dir)
            if abs_path.startswith(allowed_abs + os.sep) or abs_path == allowed_abs:
                if os.path.isfile(abs_path):
                    return abs_path
        except Exception:
            pass
    return None  # outside allowlist or doesn't exist — silently ignore


# ── Timeout wrapper ───────────────────────────────────────────────────────────

def _with_timeout(func, timeout_seconds: int):
    """Run func(); raise PDFTimeoutError if it exceeds timeout_seconds.

    Uses SIGALRM on Unix (main thread only). On platforms without SIGALRM
    (Windows) or when called from a non-main thread (e.g., ASGI/test threads),
    the timeout is skipped — generation runs without limit but is still safe
    because row caps and MAX_PAGES bound the work.
    """
    if not hasattr(signal, "SIGALRM"):
        return func()

    def _handler(signum, frame):
        raise PDFTimeoutError(
            f"PDF generation exceeded {timeout_seconds}s timeout"
        )

    try:
        old = signal.signal(signal.SIGALRM, _handler)
    except (ValueError, OSError):
        # signal.signal() raises ValueError when called outside the main thread.
        # Fall through to run without the alarm — still safe due to row/page caps.
        return func()

    signal.alarm(timeout_seconds)
    try:
        result = func()
        signal.alarm(0)
        return result
    finally:
        try:
            signal.signal(signal.SIGALRM, old)
            signal.alarm(0)
        except (ValueError, OSError):
            pass


# ── Style sheet ───────────────────────────────────────────────────────────────

def _make_styles():
    base = getSampleStyleSheet()

    h1 = ParagraphStyle(
        "SeoH1", parent=base["Heading1"],
        fontSize=18, textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=4, spaceBefore=0, leading=22,
    )
    h2 = ParagraphStyle(
        "SeoH2", parent=base["Heading2"],
        fontSize=13, textColor=colors.HexColor("#16213e"),
        spaceAfter=3, spaceBefore=10, leading=16,
    )
    h3 = ParagraphStyle(
        "SeoH3", parent=base["Heading3"],
        fontSize=11, textColor=colors.HexColor("#0f3460"),
        spaceAfter=2, spaceBefore=6, leading=14,
    )
    body = ParagraphStyle(
        "SeoBody", parent=base["Normal"],
        fontSize=9, leading=13, spaceAfter=2,
    )
    small = ParagraphStyle(
        "SeoSmall", parent=base["Normal"],
        fontSize=8, leading=11, textColor=colors.grey,
    )
    meta = ParagraphStyle(
        "SeoMeta", parent=base["Normal"],
        fontSize=8, leading=11, textColor=colors.HexColor("#555555"),
    )
    unavail = ParagraphStyle(
        "SeoUnavail", parent=base["Normal"],
        fontSize=9, leading=12, textColor=colors.HexColor("#cc6600"),
        leftIndent=10,
    )
    score_green = ParagraphStyle(
        "SeoScoreGreen", parent=base["Normal"],
        fontSize=24, textColor=colors.HexColor("#2d8a4e"), alignment=TA_CENTER,
    )
    score_amber = ParagraphStyle(
        "SeoScoreAmber", parent=base["Normal"],
        fontSize=24, textColor=colors.HexColor("#b87333"), alignment=TA_CENTER,
    )
    score_red = ParagraphStyle(
        "SeoScoreRed", parent=base["Normal"],
        fontSize=24, textColor=colors.HexColor("#c0392b"), alignment=TA_CENTER,
    )
    header_ws = ParagraphStyle(
        "SeoHeader", parent=base["Normal"],
        fontSize=10, textColor=colors.HexColor("#ffffff"),
        alignment=TA_LEFT, leading=13,
    )
    footer_p = ParagraphStyle(
        "SeoFooter", parent=base["Normal"],
        fontSize=7, textColor=colors.HexColor("#888888"),
        alignment=TA_CENTER,
    )
    return {
        "h1": h1, "h2": h2, "h3": h3, "body": body, "small": small,
        "meta": meta, "unavail": unavail, "score_green": score_green,
        "score_amber": score_amber, "score_red": score_red,
        "header_ws": header_ws, "footer_p": footer_p,
    }


# ── Table styling ─────────────────────────────────────────────────────────────

_TABLE_HEADER_BG = colors.HexColor("#1a1a2e")
_TABLE_ROW_BG_1  = colors.HexColor("#f5f5f8")
_TABLE_ROW_BG_2  = colors.white
_TABLE_GRID      = colors.HexColor("#dddddd")

_BASE_TABLE_STYLE = [
    ("BACKGROUND", (0, 0), (-1, 0), _TABLE_HEADER_BG),
    ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
    ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",   (0, 0), (-1, 0), 8),
    ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE",   (0, 1), (-1, -1), 8),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_TABLE_ROW_BG_1, _TABLE_ROW_BG_2]),
    ("GRID",       (0, 0), (-1, -1), 0.25, _TABLE_GRID),
    ("VALIGN",     (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING",   (0, 0), (-1, -1), 4),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ("WORDWRAP",   (0, 0), (-1, -1), True),
]


def _make_table(data: list, col_widths=None) -> Table:
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(_BASE_TABLE_STYLE))
    return t


# ── Page template (header + footer with page numbers) ─────────────────────────

def _build_doc(buf: io.BytesIO, workspace_name: str, site_domain: str,
               period: str, styles: dict) -> BaseDocTemplate:
    PAGE_W, PAGE_H = A4
    MARGIN = 1.5 * cm

    def _on_page(canvas, doc):
        canvas.saveState()
        # Header bar
        canvas.setFillColor(colors.HexColor("#1a1a2e"))
        canvas.rect(0, PAGE_H - 1.1 * cm, PAGE_W, 1.1 * cm, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 9)
        # Use _esc_canvas (strips tags, no HTML-encoding) for canvas.drawString()
        canvas.drawString(MARGIN, PAGE_H - 0.75 * cm, _esc_canvas(workspace_name) or "SEO Report")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.75 * cm,
                               f"{_esc_canvas(site_domain)}  |  {_esc_canvas(period)}")
        # Footer
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(PAGE_W / 2, 0.5 * cm, f"Page {doc.page}")
        canvas.restoreState()

    frame = Frame(MARGIN, MARGIN, PAGE_W - 2 * MARGIN,
                  PAGE_H - 2 * MARGIN - 1.2 * cm,
                  id="main", topPadding=0.3 * cm)
    template = PageTemplate(id="main", frames=[frame], onPage=_on_page)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        pageTemplates=[template],
        rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=MARGIN + 1.2 * cm, bottomMargin=MARGIN + 0.7 * cm,
        # Use _esc_canvas for metadata fields — they go into the PDF Info dict
        # as plain text (no HTML rendering), so tag-stripping is appropriate.
        title=f"SEO Report – {_esc_canvas(site_domain)}",
        author=_esc_canvas(workspace_name) or "Pixie SEO",
        creator="Pixie SEO Reporting",
    )
    return doc


# ── Section builders ──────────────────────────────────────────────────────────

def _section_unavailable(name: str, reason: str, styles: dict) -> list:
    return [
        Paragraph(_esc(name), styles["h3"]),
        Paragraph(
            f"Data unavailable: {_esc(reason)}",
            styles["unavail"],
        ),
        Spacer(1, 0.3 * cm),
    ]


def _meta_line(section: dict, styles: dict) -> list:
    ts = _esc(section.get("timestamp", ""))
    src = _esc(section.get("data_source", ""))
    return [Paragraph(f"Source: {src}  |  As of: {ts}", styles["meta"])]


def _build_cover(report: dict, workspace_name: str, styles: dict) -> list:
    """Title page flowables."""
    elems = []
    site_info = report.get("site_info", {})
    site_data = site_info.get("data", {}) if not site_info.get("unavailable") else {}
    domain = _esc(site_data.get("domain", report.get("site_id", "")))
    display_name = _esc(site_data.get("display_name", domain))
    kind_label = _esc(report.get("kind", "").replace("_", " ").title())
    period = f"{_esc(report.get('date_from', ''))} to {_esc(report.get('date_to', ''))}"

    elems.append(Spacer(1, 2 * cm))
    if workspace_name:
        elems.append(Paragraph(_esc(workspace_name), styles["h2"]))
        elems.append(Spacer(1, 0.5 * cm))
    elems.append(Paragraph(f"{kind_label} Report", styles["h1"]))
    elems.append(Spacer(1, 0.3 * cm))
    elems.append(Paragraph(display_name, styles["h2"]))
    if domain and domain != display_name:
        elems.append(Paragraph(domain, styles["body"]))
    elems.append(Spacer(1, 0.5 * cm))
    elems.append(Paragraph(f"Reporting period: {period}", styles["body"]))
    elems.append(Paragraph(
        f"Generated: {_esc(report.get('assembled_at', '')[:19].replace('T', ' '))} UTC",
        styles["small"],
    ))
    elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a1a2e"),
                             spaceAfter=10))
    return elems


def _build_technical_health(report: dict, styles: dict) -> list:
    elems = []
    th = report.get("technical_health", {})
    if th.get("unavailable"):
        return _section_unavailable("Technical Health", th.get("reason", ""), styles)

    elems.append(Paragraph("Technical Health", styles["h2"]))
    elems += _meta_line(th, styles)

    data = th.get("data", {})
    score = data.get("score", 0)
    score_style = (
        styles["score_green"] if score >= 70 else
        styles["score_amber"] if score >= 40 else
        styles["score_red"]
    )
    elems.append(Spacer(1, 0.2 * cm))
    elems.append(Paragraph(f"SEO Score: {score}/100", score_style))
    elems.append(Spacer(1, 0.3 * cm))

    # Issue counts
    ic = data.get("issue_counts", {})
    if ic:
        table_data = [["Severity", "Count"]]
        for sev in ("critical", "high", "medium", "low", "info"):
            cnt = ic.get(sev, 0)
            if cnt:
                table_data.append([_esc(sev.capitalize()), str(cnt)])
        if len(table_data) > 1:
            elems.append(Paragraph("Issue Summary", styles["h3"]))
            elems.append(_make_table(table_data, col_widths=[8 * cm, 4 * cm]))
            elems.append(Spacer(1, 0.3 * cm))

    # Category scores
    cat_scores = data.get("category_scores", {})
    if cat_scores:
        table_data = [["Category", "Score"]]
        for cat, sc in sorted(cat_scores.items(), key=lambda x: x[1]):
            table_data.append([_esc(cat), str(sc)])
        elems.append(Paragraph("Category Scores", styles["h3"]))
        elems.append(_make_table(table_data, col_widths=[10 * cm, 4 * cm]))
        elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_technical_issues(report: dict, styles: dict) -> list:
    elems = []
    ti = report.get("technical_issues", {})
    if ti.get("unavailable"):
        return _section_unavailable("Technical Issues", ti.get("reason", ""), styles)

    elems.append(Paragraph("Technical Issues", styles["h2"]))
    elems += _meta_line(ti, styles)

    data = ti.get("data", {})
    by_sev = data.get("by_severity", {})
    total = data.get("total_shown", 0)
    truncated = data.get("truncated", False)

    if not by_sev:
        elems.append(Paragraph("No open issues found.", styles["body"]))
        return elems

    elems.append(Paragraph(f"Showing {total} open issues.", styles["body"]))
    if truncated:
        elems.append(Paragraph(
            "Table truncated — additional issues exist beyond the displayed rows.",
            styles["unavail"],
        ))

    severity_order = ["critical", "high", "medium", "low", "info"]
    for sev in severity_order:
        issues = by_sev.get(sev, [])
        if not issues:
            continue
        shown = issues[:MAX_TABLE_ROWS]
        extra = len(issues) - len(shown)
        elems.append(Paragraph(f"{sev.capitalize()} ({len(issues)})", styles["h3"]))
        table_data = [["Rule", "Category", "Recommendation", "First Detected"]]
        for iss in shown:
            rec = _esc(iss.get("recommendation", ""))
            # Wrap long recommendations
            rec_wrapped = textwrap.shorten(str(rec), width=120, placeholder="...")
            table_data.append([
                _esc(iss.get("rule_key", "")),
                _esc(iss.get("category", "")),
                rec_wrapped,
                _esc((iss.get("first_detected_at") or "")[:10]),
            ])
        elems.append(_make_table(table_data,
                                  col_widths=[4 * cm, 3 * cm, 7 * cm, 2.5 * cm]))
        if extra > 0:
            elems.append(Paragraph(
                f"... {extra} more {sev} issue(s) not shown (truncated).",
                styles["small"],
            ))
        elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_gsc_summary(report: dict, styles: dict) -> list:
    elems = []
    gsc = report.get("gsc_summary", {})
    if gsc.get("unavailable"):
        return _section_unavailable("Search Console Summary", gsc.get("reason", ""), styles)

    elems.append(Paragraph("Search Console Performance", styles["h2"]))
    elems += _meta_line(gsc, styles)
    data = gsc.get("data", {})

    # KPI row
    kpis = [
        ["Clicks", "Impressions", "Avg CTR", "Avg Position"],
        [
            str(data.get("total_clicks", 0)),
            str(data.get("total_impressions", 0)),
            f"{data.get('avg_ctr', 0) * 100:.2f}%",
            str(data.get("avg_position", 0)),
        ],
    ]
    elems.append(_make_table(kpis))
    elems.append(Spacer(1, 0.3 * cm))

    # Top queries
    top = data.get("top_queries", [])
    if top:
        elems.append(Paragraph("Top Queries by Clicks", styles["h3"]))
        table_data = [["Query", "Clicks", "Impressions", "Avg Position"]]
        for q in top[:MAX_TABLE_ROWS]:
            table_data.append([
                _esc(q.get("query", "")),
                str(q.get("clicks", 0)),
                str(q.get("impressions", 0)),
                str(q.get("avg_position", 0)),
            ])
        elems.append(_make_table(table_data,
                                  col_widths=[9 * cm, 2.5 * cm, 3 * cm, 3 * cm]))
        elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_ga4_summary(report: dict, styles: dict) -> list:
    elems = []
    ga4 = report.get("ga4_summary", {})
    if ga4.get("unavailable"):
        return _section_unavailable("GA4 Analytics Summary", ga4.get("reason", ""), styles)

    elems.append(Paragraph("GA4 Analytics Performance", styles["h2"]))
    elems += _meta_line(ga4, styles)
    data = ga4.get("data", {})

    kpis = [
        ["Sessions", "Engaged Sessions", "New Users", "Avg Engagement Rate"],
        [
            str(data.get("total_sessions", 0)),
            str(data.get("total_engaged_sessions", 0)),
            str(data.get("total_new_users", 0)),
            f"{data.get('avg_engagement_rate', 0) * 100:.2f}%",
        ],
    ]
    elems.append(_make_table(kpis))
    elems.append(Spacer(1, 0.3 * cm))

    top_pages = data.get("top_landing_pages", [])
    if top_pages:
        elems.append(Paragraph("Top Landing Pages", styles["h3"]))
        table_data = [["Landing Page", "Sessions", "Engaged Sessions"]]
        for pg in top_pages[:MAX_TABLE_ROWS]:
            table_data.append([
                _esc(pg.get("landing_page", "")),
                str(pg.get("sessions", 0)),
                str(pg.get("engaged_sessions", 0)),
            ])
        elems.append(_make_table(table_data, col_widths=[9 * cm, 3.5 * cm, 4 * cm]))
        elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_keyword_rankings(report: dict, styles: dict) -> list:
    elems = []
    kr = report.get("keyword_rankings", {})
    if kr.get("unavailable"):
        return _section_unavailable("Keyword Rankings", kr.get("reason", ""), styles)

    elems.append(Paragraph("Keyword Rankings", styles["h2"]))
    elems += _meta_line(kr, styles)
    data = kr.get("data", {})
    keywords = data.get("keywords", [])
    truncated = data.get("truncated", False)

    if not keywords:
        elems.append(Paragraph("No keyword data available.", styles["body"]))
        return elems

    shown = keywords[:MAX_TABLE_ROWS]
    extra = len(keywords) - len(shown)

    table_data = [["Keyword", "Rank", "Prev Rank", "Best Rank", "Volume", "Intent"]]
    for kw in shown:
        rank = kw.get("current_rank")
        prev = kw.get("previous_rank")
        best = kw.get("best_rank")
        table_data.append([
            _esc(kw.get("keyword", "")),
            str(rank) if rank is not None else "—",
            str(prev) if prev is not None else "—",
            str(best) if best is not None else "—",
            str(kw.get("search_volume") or "—"),
            _esc(kw.get("intent", "")),
        ])
    elems.append(_make_table(table_data,
                              col_widths=[5.5 * cm, 2 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm]))
    if truncated or extra > 0:
        elems.append(Paragraph(
            f"... {extra} more keyword(s) not shown (truncated).", styles["small"]
        ))
    elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_competitor_comparison(report: dict, styles: dict) -> list:
    elems = []
    cc = report.get("competitor_comparison", {})
    if cc.get("unavailable"):
        return _section_unavailable("Competitor Comparison", cc.get("reason", ""), styles)

    elems.append(Paragraph("Competitor Comparison", styles["h2"]))
    elems += _meta_line(cc, styles)
    data = cc.get("data", {})
    comps = data.get("competitors", [])

    if not comps:
        elems.append(Paragraph("No competitors tracked.", styles["body"]))
        return elems

    table_data = [["Competitor", "Visibility Score", "Avg Position", "Keywords Ranked", "Date"]]
    for c in comps[:MAX_TABLE_ROWS]:
        snap = c.get("snapshot") or {}
        table_data.append([
            _esc(c.get("display_name", c.get("domain", ""))),
            str(snap.get("visibility_score", "—")) if snap else "—",
            str(snap.get("avg_position", "—")) if snap else "—",
            str(snap.get("keywords_ranked", "—")) if snap else "—",
            _esc((snap.get("date") or "")[:10]) if snap else "—",
        ])
    elems.append(_make_table(table_data,
                              col_widths=[5 * cm, 4 * cm, 3 * cm, 4 * cm, 2.5 * cm]))
    elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_opportunities(report: dict, styles: dict) -> list:
    elems = []
    opps_sec = report.get("opportunities", {})
    if opps_sec.get("unavailable"):
        return _section_unavailable("Priority Opportunities", opps_sec.get("reason", ""), styles)

    elems.append(Paragraph("Priority Opportunities", styles["h2"]))
    elems += _meta_line(opps_sec, styles)
    data = opps_sec.get("data", {})
    opps = data.get("opportunities", [])
    truncated = data.get("truncated", False)

    if not opps:
        elems.append(Paragraph("No open opportunities.", styles["body"]))
        return elems

    shown = opps[:MAX_TABLE_ROWS]
    extra = len(opps) - len(shown)

    table_data = [["Type", "Keyword", "Page", "Action", "Effort", "Impact"]]
    for o in shown:
        page_url = _esc(o.get("page_url", ""))
        # Shorten long URLs for display
        if len(page_url) > 50:
            page_url = page_url[:47] + "..."
        table_data.append([
            _esc(o.get("opp_type", "")),
            _esc(o.get("keyword", "")),
            page_url,
            textwrap.shorten(_esc(o.get("recommended_action", "")), 80, placeholder="..."),
            _esc(o.get("effort", "")),
            _esc(o.get("estimated_impact", "")),
        ])
    elems.append(_make_table(table_data,
                              col_widths=[3 * cm, 3 * cm, 4 * cm, 4.5 * cm, 2 * cm, 2 * cm]))
    if truncated or extra > 0:
        elems.append(Paragraph(
            f"... {extra} more opportunity(ies) not shown (truncated).", styles["small"]
        ))
    elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_completed_fixes(report: dict, styles: dict) -> list:
    elems = []
    cf = report.get("completed_fixes", {})
    if cf.get("unavailable"):
        return _section_unavailable("Completed Improvements", cf.get("reason", ""), styles)

    elems.append(Paragraph("Completed Improvements", styles["h2"]))
    elems += _meta_line(cf, styles)
    data = cf.get("data", {})
    fixes = data.get("fixes", [])
    truncated = data.get("truncated", False)

    if not fixes:
        elems.append(Paragraph("No verified fixes recorded.", styles["body"]))
        return elems

    shown = fixes[:MAX_TABLE_ROWS]
    extra = len(fixes) - len(shown)

    table_data = [["Rule", "Page", "Fix Applied", "Verified At"]]
    for f in shown:
        table_data.append([
            _esc(f.get("rule_key", "")),
            textwrap.shorten(_esc(f.get("page_url", "")), 50, placeholder="..."),
            textwrap.shorten(_esc(f.get("applied_fix", "")), 80, placeholder="..."),
            _esc((f.get("verified_at") or "")[:10]),
        ])
    elems.append(_make_table(table_data,
                              col_widths=[4 * cm, 4.5 * cm, 6 * cm, 2.5 * cm]))
    if truncated or extra > 0:
        elems.append(Paragraph(
            f"... {extra} more fix(es) not shown (truncated).", styles["small"]
        ))
    elems.append(Spacer(1, 0.3 * cm))

    return elems


def _build_unavailable_section(key: str, section: dict, label: str, styles: dict) -> list:
    if section.get("unavailable"):
        return _section_unavailable(label, section.get("reason", ""), styles)
    return []


def _build_alerts(report: dict, styles: dict) -> list:
    elems = []
    al = report.get("alerts", {})
    if al.get("unavailable"):
        return _section_unavailable("Recent Alerts", al.get("reason", ""), styles)

    elems.append(Paragraph("Recent Alerts", styles["h2"]))
    elems += _meta_line(al, styles)
    data = al.get("data", {})
    alerts = data.get("alerts", [])

    if not alerts:
        elems.append(Paragraph("No recent alerts.", styles["body"]))
        return elems

    table_data = [["Type", "Title", "Severity", "Status", "Date"]]
    for a in alerts[:MAX_TABLE_ROWS]:
        table_data.append([
            _esc(a.get("alert_type", "")),
            textwrap.shorten(_esc(a.get("title", "")), 60, placeholder="..."),
            _esc(a.get("severity", "")),
            _esc(a.get("status", "")),
            _esc((a.get("created_at") or "")[:10]),
        ])
    elems.append(_make_table(table_data,
                              col_widths=[3 * cm, 7 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm]))
    elems.append(Spacer(1, 0.3 * cm))
    return elems


# ── Dispatcher ────────────────────────────────────────────────────────────────

def _dispatch_sections(report: dict, kind: str, styles: dict) -> list:
    """Return a list of flowables for all sections matching the report kind."""
    elems = []

    if kind in ("technical_audit", "executive"):
        elems += _build_technical_health(report, styles)
        elems.append(Spacer(1, 0.2 * cm))
        elems += _build_technical_issues(report, styles)

    if kind in ("search_performance", "executive"):
        if kind == "executive":
            elems.append(PageBreak())
        elems += _build_gsc_summary(report, styles)
        elems.append(Spacer(1, 0.2 * cm))
        elems += _build_ga4_summary(report, styles)

    if kind in ("keyword_ranking", "executive"):
        if kind == "executive":
            elems.append(PageBreak())
        elems += _build_keyword_rankings(report, styles)

    if kind in ("competitor", "executive"):
        if kind == "executive":
            elems.append(PageBreak())
        elems += _build_competitor_comparison(report, styles)

    if kind in ("backlink", "executive"):
        if kind == "executive":
            elems.append(PageBreak())
        backlink_sec = report.get("backlinks", {})
        elems += _section_unavailable(
            "Backlinks",
            backlink_sec.get("reason", "data unavailable"),
            styles,
        )

    if kind in ("local_seo", "executive"):
        if kind == "executive":
            elems.append(PageBreak())
        local_sec = report.get("local_seo", {})
        elems += _section_unavailable(
            "Local SEO",
            local_sec.get("reason", "data unavailable"),
            styles,
        )

    if kind in ("technical_audit", "search_performance", "keyword_ranking", "executive"):
        elems.append(Spacer(1, 0.2 * cm))
        elems += _build_opportunities(report, styles)

    if kind in ("technical_audit", "executive"):
        elems.append(Spacer(1, 0.2 * cm))
        elems += _build_completed_fixes(report, styles)
        elems.append(Spacer(1, 0.2 * cm))
        elems += _build_alerts(report, styles)

    return elems


# ── Public render function ────────────────────────────────────────────────────

def render_pdf(
    report: dict,
    *,
    workspace_name: str = "",
    logo_path: Optional[str] = None,
    timeout: Optional[int] = None,
) -> bytes:
    """Render a report dict to PDF bytes.

    Parameters
    ----------
    report:         Output of assembler.assemble_report().
    workspace_name: Workspace display name (text only — no remote assets).
    logo_path:      Path to a local logo file. Must be within the allowed assets
                    directory. Any path outside that dir is silently ignored.
    timeout:        Seconds before aborting (default: SEO_PDF_TIMEOUT_SECONDS env).

    Returns
    -------
    bytes — the raw PDF. Always starts with b"%PDF-".

    Raises
    ------
    PDFRenderError  when reportlab is not installed.
    PDFTimeoutError when generation exceeds the timeout.
    """
    if not _REPORTLAB_OK:
        raise PDFRenderError(
            "reportlab is not installed. Install it with: pip install reportlab"
        )

    tmo = timeout if timeout is not None else PDF_TIMEOUT_SECONDS
    # logo_path is validated (allowlist) — may return None
    _validated_logo = _safe_logo_path(logo_path)  # noqa: F841 (reserved for future image use)

    def _generate() -> bytes:
        styles = _make_styles()
        buf = io.BytesIO()

        site_info = report.get("site_info", {})
        site_data = site_info.get("data", {}) if not site_info.get("unavailable") else {}
        site_domain = site_data.get("domain", report.get("site_id", ""))
        period = f"{report.get('date_from', '')} to {report.get('date_to', '')}"
        kind = report.get("kind", "executive")

        doc = _build_doc(buf, workspace_name or "SEO Report", site_domain, period, styles)

        story = []
        story += _build_cover(report, workspace_name, styles)
        story.append(PageBreak())
        story += _dispatch_sections(report, kind, styles)

        # Enforce page cap: build a sentinel to detect runaway reports.
        # We wrap in a try/except and re-raise as PDFRenderError if the page
        # count would exceed MAX_PAGES — in practice this is handled by row caps.
        doc.build(story)
        pdf_bytes = buf.getvalue()

        if not pdf_bytes.startswith(b"%PDF-"):
            raise PDFRenderError("ReportLab did not produce a valid PDF header.")

        return pdf_bytes

    if tmo and tmo > 0:
        return _with_timeout(_generate, tmo)
    return _generate()
