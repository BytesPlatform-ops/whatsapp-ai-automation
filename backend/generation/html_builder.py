"""Parallel HTML builder (DEMO flow).

Goal: a whole bespoke website in ~60s. Instead of one slow giant generation, we
use a small **parallel agent system**:

    planner (1 call)  →  decides brand + palette + fonts + section list
        │
        ├─ section agent ┐
        ├─ section agent ┤   ALL sections generated concurrently (asyncio.gather)
        ├─ section agent ┘
        │
    assembler (pure code)  →  one <style> (palette vars + base classes) + all
                              section fragments → a single self-contained HTML file

Why parallel: wall-clock ≈ planner + slowest single section, not the sum of all
sections. Coherence is preserved because the planner fixes the design system
(palette/fonts/CSS class contract) up front; section agents only fill content
inside it. Everything routes through `models/`, so fake mode runs keyless.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from time import perf_counter

from models import ModelRequest, ModelResult, get_router
from schemas import ModelTier, Request

# --------------------------------------------------------------------------- #
# Prompts (real-model mode). Fake mode ignores these and returns canned output.
# --------------------------------------------------------------------------- #

PLANNER_SYSTEM = """You are Pixie's lead designer. Given a business in plain language, return ONLY a JSON object (no fences) describing a bespoke website's design system and section plan:
{
  "brand": "name", "business_type": "...", "voice": "tone in 3-4 words",
  "palette": {"primary":"#hex","accent":"#hex","bg":"#hex","surface":"#hex","text":"#hex","muted":"#hex"},
  "fonts": {"heading":"Google Font name","body":"Google Font name"},
  "sections": [ {"id":"hero","type":"hero","brief":"what this section must say/do for THIS business"} ]
}
Rules: intentional palette (NOT default blue). Pick sections that fit the business (restaurant→hero,menu,hours,location,reserve; plumber→hero,services,area,reviews,call). 5-7 sections. Real brand voice."""

SECTION_SYSTEM = """You are Pixie building ONE section of a website. You are given the shared design system and this section's brief. Return ONLY the inner HTML for this one section — a single <section>...</section> (no <html>, <head>, <style>, no markdown fences).
Use ONLY these shared CSS classes/vars (already defined globally): wrap, eyebrow, btn, btn-primary, btn-ghost, grid, card, hero; and CSS vars --primary --accent --bg --surface --text --muted. Real, specific copy for this business — never lorem. Use https://images.unsplash.com/ style URLs or CSS gradients for imagery; never broken images."""


@dataclass
class HtmlBuildOutput:
    html: str
    brief: dict
    results: list[ModelResult] = field(default_factory=list)
    plan_ms: int = 0
    sections_wall_ms: int = 0
    total_wall_ms: int = 0

    @property
    def n_sections(self) -> int:
        return len(self.brief.get("sections", []))

    @property
    def cost_usd(self) -> float:
        return round(sum(r.cost_usd for r in self.results), 6)

    @property
    def tokens(self) -> int:
        return sum(r.tokens_in + r.tokens_out for r in self.results)

    @property
    def sequential_ms_estimate(self) -> int:
        """What it WOULD have cost run one-after-another (to show the parallel win)."""
        return self.plan_ms + sum(r.latency_ms for r in self.results if r is not None) - self._plan_latency()

    def _plan_latency(self) -> int:
        return self.results[0].latency_ms if self.results else 0


_FENCE = re.compile(r"^```[a-zA-Z]*\n?|\n?```$")


def _strip_fences(text: str) -> str:
    return _FENCE.sub("", text.strip()).strip()


def _safe_json(text: str) -> dict:
    try:
        return json.loads(_strip_fences(text))
    except Exception:
        return {}


async def build_site_html(request: Request, *, router=None) -> HtmlBuildOutput:
    router = router or get_router()
    t_total = perf_counter()

    # 1) PLAN — one cheap call decides the whole design system + section list.
    t_plan = perf_counter()
    plan_res = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="plan_site", system=PLANNER_SYSTEM, user=request.message,
        context={"tenant_id": request.tenant_id},
    ))
    plan_ms = int((perf_counter() - t_plan) * 1000)
    brief = _safe_json(plan_res.text)
    sections = brief.get("sections", [])

    # 2) SECTIONS — generate every section CONCURRENTLY.
    t_sec = perf_counter()
    section_reqs = [
        ModelRequest(
            tier=ModelTier.LARGE, task="build_section",
            system=SECTION_SYSTEM,
            user=json.dumps({"design": {k: brief.get(k) for k in ("brand", "business_type", "voice", "palette", "fonts")}, "section": s}),
            context={"design": brief, "section": s},
        )
        for s in sections
    ]
    section_results = await asyncio.gather(*(router.complete(r) for r in section_reqs))
    sections_wall_ms = int((perf_counter() - t_sec) * 1000)

    fragments = [_strip_fences(r.text) for r in section_results]

    # 3) ASSEMBLE — pure code: one coherent shell + all fragments.
    html = assemble_html(brief, fragments)

    total_wall_ms = int((perf_counter() - t_total) * 1000)
    return HtmlBuildOutput(
        html=html, brief=brief,
        results=[plan_res, *section_results],
        plan_ms=plan_ms, sections_wall_ms=sections_wall_ms, total_wall_ms=total_wall_ms,
    )


def assemble_html(brief: dict, fragments: list[str]) -> str:
    """Wrap section fragments in one self-contained, coherent HTML document."""
    p = {**{"primary": "#6d28d9", "accent": "#f59e0b", "bg": "#0b0f17", "surface": "#141a26",
            "text": "#eef2f7", "muted": "#9aa6b2"}, **(brief.get("palette") or {})}
    f = {**{"heading": "Sora", "body": "Inter"}, **(brief.get("fonts") or {})}
    brand = brief.get("brand", "Pixie Site")
    body = "\n".join(fragments)
    fonts_q = "&".join(f"family={x.replace(' ', '+')}:wght@400;500;600;700;800" for x in dict.fromkeys([f["heading"], f["body"]]))

    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{brand}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{fonts_q}&display=swap">
<style>
:root{{--primary:{p['primary']};--accent:{p['accent']};--bg:{p['bg']};--surface:{p['surface']};--text:{p['text']};--muted:{p['muted']};}}
*{{box-sizing:border-box;margin:0}}
body{{font-family:'{f['body']}',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}}
h1,h2,h3,.eyebrow{{font-family:'{f['heading']}','{f['body']}',sans-serif}}
h1{{font-size:clamp(2.4rem,6vw,4.2rem);line-height:1.04;font-weight:800;letter-spacing:-.02em}}
h2{{font-size:clamp(1.6rem,3.6vw,2.6rem);font-weight:700;margin-bottom:.4em}}
.wrap{{max-width:1100px;margin:0 auto;padding:0 24px}}
section{{padding:84px 24px}}
.hero{{min-height:72vh;display:flex;align-items:center}}
.eyebrow{{text-transform:uppercase;letter-spacing:.18em;font-size:.72rem;font-weight:700;color:var(--accent);margin-bottom:14px}}
.btn{{display:inline-flex;align-items:center;gap:.5em;padding:13px 24px;border-radius:999px;font-weight:600;text-decoration:none;transition:transform .15s,box-shadow .15s;border:2px solid transparent}}
.btn:hover{{transform:translateY(-2px)}}
.btn-primary{{background:var(--primary);color:#fff;box-shadow:0 16px 40px -12px var(--primary)}}
.btn-ghost{{border-color:var(--muted);color:var(--text)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:20px;margin-top:34px}}
.card{{background:var(--surface);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:24px}}
img{{max-width:100%;display:block;border-radius:14px}}
a{{color:var(--accent)}}
</style>
</head><body>
{body}
<footer class="wrap" style="padding:48px 24px;color:var(--muted);font-size:.85rem;text-align:center">© {brand}</footer>
</body></html>"""
