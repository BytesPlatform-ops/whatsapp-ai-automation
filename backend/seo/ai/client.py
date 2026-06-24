"""SeoAiClient — fallback-safe AI utility layer for the SEO service.

Every public method returns an :class:`AiResult` and NEVER raises. AI calls go
through the existing model layer (``backend/models``) ONLY when it is importable
and usable; otherwise they fall back to deterministic heuristics.

The model-layer import is lazy (inside ``_complete``) and wrapped in
``try/except Exception`` — importing ``models`` pulls in pydantic, which is
absent in the local stdlib-only interpreter, so locally every call falls through
to the heuristic. That is by design.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from seo.prompts import (
    render_content_suggestions,
    render_image_alt,
    render_keyword_usage,
    render_local_seo,
    render_meta_description,
    render_meta_title,
    render_readability,
)

from . import fallbacks


def _split_lines(text: str) -> List[str]:
    """Split a model completion into clean suggestion items."""
    items: List[str] = []
    for line in (text or "").splitlines():
        s = line.strip().lstrip("-*•0123456789.) ").strip()
        if s:
            items.append(s)
    return items


@dataclass
class AiResult:
    text: str = ""
    items: list = field(default_factory=list)
    provider: str = ""
    model: str = ""
    estimated_cost: float = 0.0
    latency_ms: int = 0
    cache_hit: bool = False
    fallback: bool = True

    def to_dict(self) -> Dict[str, object]:
        return {
            "text": self.text,
            "items": list(self.items),
            "provider": self.provider,
            "model": self.model,
            "estimated_cost": self.estimated_cost,
            "latency_ms": self.latency_ms,
            "cache_hit": self.cache_hit,
            "fallback": self.fallback,
        }


# Short tasks → SMALL tier; heavy/long tasks → LARGE tier.
_SMALL_TASKS = frozenset({"meta_title", "meta_description", "image_alt", "keyword_usage"})


class SeoAiClient:
    """Fallback-safe SEO AI helper.

    ``mode="fallback"`` forces deterministic heuristics (no model layer touched).
    ``mode=None`` (default) tries the model layer and falls back on any failure.
    """

    def __init__(self, mode: Optional[str] = None) -> None:
        self.mode = mode

    # ------------------------------------------------------------------
    # Model layer bridge (lazy, fully guarded)
    # ------------------------------------------------------------------
    def _complete(self, task: str, tier_hint: str, prompt: str) -> Optional[Tuple]:
        """Call the model layer. Returns ``(text, provider, model, cost, latency)``
        or ``None`` (→ caller uses the heuristic). Never raises."""
        if self.mode == "fallback":
            return None
        try:
            import asyncio

            from models import ModelRequest, get_router  # type: ignore
            from schemas import ModelTier  # type: ignore

            tier = ModelTier.SMALL if task in _SMALL_TASKS else ModelTier.LARGE
            router = get_router()
            req = ModelRequest(
                tier=tier,
                task="seo:{0}".format(task),
                system="You are an SEO assistant.",
                user=prompt,
                expects_json=False,
            )
            result = asyncio.run(router.complete(req))
            text = (result.text or "").strip()
            if not text:
                return None
            provider = getattr(getattr(router, "_provider", None), "name", "") or ""
            return (
                text,
                provider,
                getattr(result, "model", "") or "",
                float(getattr(result, "cost_usd", 0.0) or 0.0),
                int(getattr(result, "latency_ms", 0) or 0),
            )
        except Exception:
            return None

    @staticmethod
    def _from_model(out: Tuple, *, text: str = "", items: Optional[List[str]] = None) -> AiResult:
        model_text, provider, model, cost, latency = out
        return AiResult(
            text=text if text else model_text,
            items=items if items is not None else [],
            provider=provider,
            model=model,
            estimated_cost=cost,
            latency_ms=latency,
            cache_hit=False,
            fallback=False,
        )

    # ------------------------------------------------------------------
    # Public methods — each tries the model, then the heuristic.
    # ------------------------------------------------------------------
    def meta_title(self, *, title: str = "", content: str = "", brand: str = "", business_type: str = "") -> AiResult:
        prompt = render_meta_title(title=title, content=content, brand=brand, business_type=business_type)
        out = self._complete("meta_title", "small", prompt)
        if out is not None:
            return self._from_model(out, text=out[0])
        text = fallbacks.heuristic_title(title=title, content=content, brand=brand)
        return AiResult(text=text, fallback=True)

    def meta_description(self, *, description: str = "", content: str = "", business_type: str = "") -> AiResult:
        prompt = render_meta_description(description=description, content=content, business_type=business_type)
        out = self._complete("meta_description", "small", prompt)
        if out is not None:
            return self._from_model(out, text=out[0])
        text = fallbacks.heuristic_description(description=description, content=content)
        return AiResult(text=text, fallback=True)

    def image_alt(self, *, src: str = "", context: str = "") -> AiResult:
        prompt = render_image_alt(src=src, context=context)
        out = self._complete("image_alt", "small", prompt)
        if out is not None:
            return self._from_model(out, text=out[0])
        text = fallbacks.heuristic_alt(src=src, context=context)
        return AiResult(text=text, fallback=True)

    def content_suggestions(self, *, content: str = "", keywords=None) -> AiResult:
        prompt = render_content_suggestions(content=content, keywords=keywords)
        out = self._complete("content_suggestions", "large", prompt)
        if out is not None:
            return self._from_model(out, text=out[0], items=_split_lines(out[0]))
        items = self._heuristic_content_items(content, keywords)
        return AiResult(text="\n".join(items), items=items, fallback=True)

    def readability_suggestions(self, *, content: str = "") -> AiResult:
        prompt = render_readability(content=content)
        out = self._complete("readability_suggestions", "large", prompt)
        if out is not None:
            return self._from_model(out, text=out[0], items=_split_lines(out[0]))
        items = self._heuristic_readability_items(content)
        return AiResult(text="\n".join(items), items=items, fallback=True)

    def local_seo_suggestions(self, *, business_type: str = "", nap=None) -> AiResult:
        prompt = render_local_seo(business_type=business_type, nap=nap)
        out = self._complete("local_seo_suggestions", "large", prompt)
        if out is not None:
            return self._from_model(out, text=out[0], items=_split_lines(out[0]))
        items = self._heuristic_local_items(business_type, nap)
        return AiResult(text="\n".join(items), items=items, fallback=True)

    def keyword_usage_suggestions(self, *, content: str = "", target_keywords=None) -> AiResult:
        prompt = render_keyword_usage(content=content, target_keywords=target_keywords)
        out = self._complete("keyword_usage", "small", prompt)
        if out is not None:
            return self._from_model(out, text=out[0], items=_split_lines(out[0]))
        items = fallbacks.heuristic_keyword_usage(content=content, target_keywords=target_keywords)
        if not items:
            items = ["No target keywords supplied. Provide 1-3 focus keywords for usage analysis."]
        return AiResult(text="\n".join(items), items=items, fallback=True)

    # ------------------------------------------------------------------
    # Deterministic heuristics for list-producing tasks.
    # ------------------------------------------------------------------
    @staticmethod
    def _heuristic_content_items(content: str, keywords) -> List[str]:
        items: List[str] = []
        body = (content or "").strip()
        words = len(body.split())
        if words < 300:
            items.append(
                "Content is thin ({0} words). Expand to 300+ words of useful, original copy.".format(words)
            )
        else:
            items.append("Break long copy into scannable sections with descriptive H2/H3 headings.")
        items.append("Add a clear, keyword-relevant H1 near the top of the page.")
        items.append("Include internal links to related pages and one authoritative external link.")
        for kw in (keywords or []):
            term = str(kw).strip()
            if term and term.lower() not in body.lower():
                items.append("Work the keyword '{0}' naturally into a heading and the intro.".format(term))
        items.append("End with a clear call-to-action that matches the page intent.")
        return items

    @staticmethod
    def _heuristic_readability_items(content: str) -> List[str]:
        items: List[str] = []
        body = (content or "").strip()
        sents = [s.strip() for s in re.split(r"[.!?]+", body) if s.strip()]
        long_sents = [s for s in sents if len(s.split()) > 25]
        if long_sents:
            items.append(
                "Shorten {0} long sentence(s) (25+ words) into two for easier reading.".format(len(long_sents))
            )
        else:
            items.append("Sentence length looks good; keep most sentences under 25 words.")
        items.append("Use short paragraphs (2-3 sentences) and bullet lists for dense information.")
        items.append("Prefer plain language and active voice over jargon.")
        items.append("Add subheadings every few paragraphs to aid scanning.")
        return items

    @staticmethod
    def _heuristic_local_items(business_type: str, nap) -> List[str]:
        items: List[str] = []
        nap_map = nap if isinstance(nap, dict) else {}
        for field_name in ("name", "address", "phone"):
            if not str(nap_map.get(field_name, "")).strip():
                items.append("Add a consistent business {0} (NAP) across the site footer and contact page.".format(field_name))
        items.append("Claim and complete your Google Business Profile with accurate hours and categories.")
        items.append("Add LocalBusiness structured data (schema.org) with NAP and geo-coordinates.")
        items.append("Build consistent citations on local directories (Yelp, Bing Places, Apple Maps).")
        items.append("Request and respond to customer reviews to strengthen local signals.")
        if str(business_type or "").strip():
            items.append("Target '{0} near me' style local keywords in titles and headings.".format(str(business_type).strip()))
        return items
