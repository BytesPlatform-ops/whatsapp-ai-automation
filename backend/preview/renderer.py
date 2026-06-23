"""Render a `Site` to a standalone HTML string (visual QA only)."""

from __future__ import annotations

import html
from urllib.parse import quote_plus

from schemas import Section, Site
from schemas.common import Alignment, BackgroundStyle, SectionType


def _esc(s: str | None) -> str:
    return html.escape(s) if s else ""


def _font_link(*families: str) -> str:
    fams = "&".join(f"family={quote_plus(f)}:wght@400;500;600;700;800" for f in dict.fromkeys(families))
    return f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fams}&display=swap">'


def _section_bg(site: Site, bg: BackgroundStyle) -> str:
    p = site.palette
    return {
        BackgroundStyle.SOLID: f"background:{p.background};",
        BackgroundStyle.MUTED: f"background:{p.surface or '#f4f4f5'};",
        BackgroundStyle.DARK: f"background:{p.text};color:{p.background};",
        BackgroundStyle.ACCENT: f"background:{p.accent or p.primary};color:#fff;",
        BackgroundStyle.GRADIENT: f"background:linear-gradient(120deg,{p.primary},{p.accent or p.secondary or p.primary});color:#fff;",
        BackgroundStyle.IMAGE: f"background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.55)),{p.primary};color:#fff;",
    }.get(bg, f"background:{p.background};")


def _btn(label: str, href: str, primary: bool, site: Site) -> str:
    p = site.palette
    if primary:
        style = f"background:{p.primary};color:#fff;border:2px solid {p.primary};"
    else:
        style = f"background:transparent;color:inherit;border:2px solid currentColor;opacity:.9;"
    return f'<a class="btn" style="{style}" href="{_esc(href)}">{_esc(label)}</a>'


def _ctas(sec: Section, site: Site) -> str:
    if not sec.ctas:
        return ""
    out = "".join(_btn(c.label, c.href, c.style.value == "primary", site) for c in sec.ctas)
    return f'<div class="ctas">{out}</div>'


def _items_cards(sec: Section, site: Site) -> str:
    cards = []
    for it in sec.items:
        price = f'<div class="price">{_esc(it.price)}</div>' if it.price else ""
        badge = f'<span class="badge">{_esc(it.badge)}</span>' if it.badge else ""
        cards.append(
            f'<div class="card"><div class="card-top">{_esc(it.title)}{badge}</div>'
            f'<p>{_esc(it.description or it.subtitle)}</p>{price}</div>'
        )
    return f'<div class="cards">{"".join(cards)}</div>'


def _items_menu(sec: Section) -> str:
    rows = []
    for it in sec.items:
        rows.append(
            f'<div class="menu-row"><div><strong>{_esc(it.title)}</strong>'
            f'<span class="muted"> {_esc(it.description)}</span></div>'
            f'<div class="dotfill"></div><div class="price">{_esc(it.price)}</div></div>'
        )
    return f'<div class="menu">{"".join(rows)}</div>'


def _render_section(sec: Section, site: Site) -> str:
    align = {Alignment.LEFT: "left", Alignment.CENTER: "center", Alignment.RIGHT: "right"}[sec.style.alignment]
    bg = _section_bg(site, sec.style.background)
    eyebrow = f'<div class="eyebrow">{_esc(sec.eyebrow)}</div>' if sec.eyebrow else ""
    heading = f"<h2>{_esc(sec.heading)}</h2>" if sec.heading else ""
    sub = f'<p class="sub">{_esc(sec.subheading)}</p>' if sec.subheading else ""
    body = f"<p>{_esc(sec.body)}</p>" if sec.body else ""

    if sec.type == SectionType.HERO:
        heading = f"<h1>{_esc(sec.heading)}</h1>" if sec.heading else ""
        inner = f"{eyebrow}{heading}{sub}{_ctas(sec, site)}"
        return f'<section class="hero" style="{bg};text-align:{align}"><div class="wrap">{inner}</div></section>'

    if sec.type == SectionType.MENU:
        inner = f"{eyebrow}{heading}{sub}{_items_menu(sec)}{_ctas(sec, site)}"
    elif sec.items:
        inner = f"{eyebrow}{heading}{sub}{_items_cards(sec, site)}{_ctas(sec, site)}"
    else:
        inner = f"{eyebrow}{heading}{sub}{body}{_ctas(sec, site)}"

    return f'<section style="{bg};text-align:{align}"><div class="wrap">{inner}</div></section>'


def render_site(site: Site) -> str:
    p = site.palette
    t = site.typography
    sections = "".join(_render_section(s, site) for s in site.ordered_sections())
    return f"""<!doctype html>
<html lang="{_esc(site.meta.locale)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(site.meta.seo_title or site.meta.brand_name)}</title>
<meta name="description" content="{_esc(site.meta.seo_description)}">
{_font_link(t.heading_font, t.body_font)}
<style>
  :root {{ --primary:{p.primary}; --accent:{p.accent or p.primary}; --bg:{p.background}; --text:{p.text}; --muted:{p.muted or '#6b7280'}; }}
  * {{ box-sizing:border-box; margin:0; }}
  body {{ font-family:'{t.body_font}',system-ui,sans-serif; color:var(--text); background:var(--bg); font-size:{t.base_size_px}px; line-height:1.6; }}
  h1,h2,.eyebrow {{ font-family:'{t.heading_font}','{t.body_font}',serif; }}
  h1 {{ font-size:clamp(2.4rem,6vw,4rem); line-height:1.05; font-weight:800; letter-spacing:-.02em; }}
  h2 {{ font-size:clamp(1.6rem,3.5vw,2.6rem); font-weight:700; margin-bottom:.5rem; }}
  .topbar {{ display:flex; justify-content:space-between; align-items:center; padding:18px 28px; border-bottom:1px solid rgba(0,0,0,.06); position:sticky; top:0; background:var(--bg); z-index:9; }}
  .brand {{ font-family:'{t.heading_font}',serif; font-weight:800; font-size:1.25rem; }}
  section {{ padding:84px 28px; }}
  .wrap {{ max-width:1080px; margin:0 auto; }}
  .hero {{ min-height:62vh; display:flex; align-items:center; }}
  .eyebrow {{ text-transform:uppercase; letter-spacing:.18em; font-size:.72rem; font-weight:700; opacity:.75; margin-bottom:14px; }}
  .sub {{ font-size:1.2rem; opacity:.85; margin-top:14px; max-width:46ch; }}
  .hero[style*="center"] .sub, section[style*="center"] .sub {{ margin-left:auto; margin-right:auto; }}
  .ctas {{ display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; }}
  section[style*="center"] .ctas {{ justify-content:center; }}
  .btn {{ display:inline-flex; align-items:center; padding:13px 22px; border-radius:999px; font-weight:600; text-decoration:none; transition:transform .15s; }}
  .btn:hover {{ transform:translateY(-2px); }}
  .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; margin-top:32px; text-align:left; }}
  .card {{ background:rgba(255,255,255,.06); border:1px solid rgba(128,128,128,.18); border-radius:16px; padding:22px; }}
  .card-top {{ font-weight:700; font-size:1.1rem; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }}
  .badge {{ font-size:.65rem; text-transform:uppercase; letter-spacing:.1em; background:var(--accent); color:#111; padding:3px 8px; border-radius:999px; }}
  .price {{ font-weight:700; color:var(--accent); margin-top:6px; }}
  .menu {{ margin-top:30px; text-align:left; }}
  .menu-row {{ display:flex; align-items:baseline; gap:10px; padding:12px 0; border-bottom:1px dashed rgba(128,128,128,.25); }}
  .menu-row .price {{ margin:0; white-space:nowrap; }}
  .dotfill {{ flex:1; border-bottom:1px dotted rgba(128,128,128,.4); transform:translateY(-4px); }}
  .muted {{ color:var(--muted); }}
  .footer {{ padding:40px 28px; text-align:center; opacity:.7; font-size:.85rem; }}
</style>
</head>
<body>
  <div class="topbar"><div class="brand">{_esc(site.meta.brand_name)}</div><div class="muted">{_esc(site.meta.tagline)}</div></div>
  {sections}
  <div class="footer">{_esc(site.meta.brand_name)} — preview rendered from Pixie <code>Site</code> JSON · palette: {_esc(p.name)}</div>
</body>
</html>"""
