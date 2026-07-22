"""Content generation service — provider-independent.

* Mock/fake mode (default, ``PIXIE_MODEL_MODE=fake``): deterministic, schema-valid
  sample content per type — clearly stamped ``mock=True`` in metadata. Never a
  single generic placeholder; each type has its own shape.
* Real mode (``PIXIE_MODEL_MODE=openai`` …): reuses the shared ``models`` layer
  (the same seam content_creator uses). If the provider isn't usable, raises
  :class:`ProviderUnavailable` — never a silent fallback to fake.

No secrets are logged; raw provider errors never propagate to the browser (the
router maps them to a safe message).
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import List, Tuple

from .enums import STRUCTURED_TYPES, ContentType
from .errors import ErrorCategory, ProviderError, classify
from .prompts import PROMPT_VERSION, build_prompt, structured_schema
from .schemas import GeneratedVariation, GenerationInputs, GenerationOptions, GenerationResult, UsageMeta

# Hard cap on paid model calls per generation request (matches the 1–5 variation
# bound) — a guardrail against an unbounded fan-out of paid calls.
MAX_VARIATIONS = 5


class ProviderUnavailable(ProviderError):
    """Real mode requested but no usable model provider is configured.

    A subclass of :class:`ProviderError` (category ``provider_not_configured``) so
    existing callers that catch ``ProviderUnavailable`` still work while the router
    can treat every provider failure uniformly via the shared error mapping."""

    def __init__(self, internal: str = "") -> None:
        super().__init__(ErrorCategory.PROVIDER_NOT_CONFIGURED, internal)


def model_mode() -> str:
    return os.getenv("PIXIE_MODEL_MODE", "fake").strip().lower()


def is_mock() -> bool:
    return model_mode() in ("", "fake", "mock")


def _seed(*parts: str) -> int:
    return int(hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:6], 16)


def _emoji(options: GenerationOptions, e: str) -> str:
    return f"{e} " if options.include_emojis else ""


def _hashtags(inputs: GenerationInputs, options: GenerationOptions) -> str:
    if not options.include_hashtags:
        return ""
    words = [inputs.topic, inputs.audience, options.platform, inputs.keyword]
    tags = ["#" + "".join(ch for ch in (w or "").split()[0].lower() if ch.isalnum()) for w in words if w]
    return "\n\n" + " ".join(dict.fromkeys(t for t in tags if len(t) > 1))


# ── Per-type deterministic mock builders → (title, text, structured) ─────────
def _mock_variation(ct: ContentType, inputs: GenerationInputs, options: GenerationOptions, i: int) -> Tuple[str, str, dict]:
    plat = options.platform or inputs.target_platform or "generic"
    topic = inputs.topic or inputs.product or inputs.name or inputs.keyword or "your business"
    tone = options.tone or "friendly"
    tag = _hashtags(inputs, options)
    label = f" (v{i + 1})" if options.variations > 1 else ""

    if ct == ContentType.SOCIAL_POST:
        text = f"{_emoji(options,'✨')}{topic.capitalize()} — here's why it matters{label}.\n\nQuick take for {inputs.audience or 'you'}: {inputs.goal or 'save time and get results'}. Keep it simple, start today.\n\n{options.cta or 'Learn more →'}{tag}"
        return f"{plat} post: {topic}", text, {}
    if ct == ContentType.CAPTION:
        text = f"{_emoji(options,'📸')}{topic.capitalize()}{label}. {inputs.image_context or ''}\n{options.cta or 'Tap the link in bio.'}{tag}"
        return f"Caption: {topic}", text, {}
    if ct == ContentType.BLOG:
        title = inputs.title or f"A practical guide to {topic}"
        secs = "\n\n".join(f"## {h}\n{h} matters because it helps {inputs.audience or 'readers'} {inputs.goal or 'make a better choice'}." for h in ["Getting started", "What to look for", "Common mistakes"])
        text = f"# {title}{label}\n\nIf you care about {topic}, this {tone} guide walks you through the essentials.\n\n{secs}\n\n## Conclusion\n{options.cta or 'Ready to take the next step? Get in touch.'}"
        return title, text, {}
    if ct == ContentType.EMAIL:
        subjects = [f"{topic.capitalize()}: {inputs.offer or 'a quick note'}", f"Don't miss this{label}", f"For {inputs.audience or 'you'}"]
        body = f"Hi there,\n\n{inputs.objective or f'We wanted to share something about {topic}.'} {inputs.offer or ''}\n\n{options.cta or 'Reply to learn more.'}\n\n— The team"
        text = "Subject options:\n- " + "\n- ".join(subjects) + f"\n\n{body}"
        return subjects[0], text, {"subject_lines": subjects, "body": body}
    if ct == ContentType.AD_COPY:
        s = {
            "primary_text": f"{inputs.pain_point or 'Struggling with ' + topic + '?'} {inputs.benefit or 'We can help'}.{label}",
            "headline": f"{topic.capitalize()} made easy",
            "description": inputs.offer or f"Great for {inputs.audience or 'everyone'}.",
            "cta": options.cta or "Learn More",
        }
        text = f"{s['headline']}\n{s['primary_text']}\n{s['description']}\nCTA: {s['cta']}"
        return s["headline"], text, s
    if ct == ContentType.PRODUCT_DESCRIPTION:
        feats = "\n".join(f"• {f}" for f in (inputs.features or ["Quality build", "Great value"]))
        aud = inputs.audience or "you"
        benefit_line = inputs.benefits or f"Designed for {aud}."
        text = f"{(inputs.name or topic).capitalize()}{label}\n\n{benefit_line}\n\n{feats}\n\n{options.cta or 'Order today.'}"
        return inputs.name or topic, text, {}
    if ct == ContentType.SEO_CONTENT:
        kw = inputs.keyword or topic
        s = {
            "meta_title": f"{kw.capitalize()}{' in ' + inputs.location if inputs.location else ''} | {inputs.business_details[:20] or 'Pixie'}",
            "meta_description": f"Looking for {kw}? {inputs.search_intent or 'Find what you need'} — {options.cta or 'get started today'}.",
            "h1": f"{kw.capitalize()}{' in ' + inputs.location if inputs.location else ''}",
            "sections": [{"heading": h, "body": f"{h}: helpful, keyword-aware copy about {kw}."} for h in ["Overview", "Why choose us", "FAQ"]],
        }
        text = f"{s['h1']}\n\n{s['meta_description']}\n\n" + "\n\n".join(f"{x['heading']}\n{x['body']}" for x in s["sections"])
        return s["h1"], text, s
    if ct == ContentType.VIDEO_SCRIPT:
        beats = "\n".join(f"[Scene {n}] {p}" for n, p in enumerate((inputs.key_points or [f'Show {topic}', 'Explain the benefit', 'Prove it']), 1))
        text = f"HOOK: {inputs.hook or f'Ever wondered about {topic}?'}{label}\n\n{beats}\n\nCTA: {options.cta or 'Follow for more.'}"
        return f"Script: {topic}", text, {}
    if ct == ContentType.CAROUSEL:
        n = max(3, min(10, inputs.slide_count or 5))
        slides = [{"title": f"Slide {k+1}", "body": (inputs.key_points[k] if k < len(inputs.key_points) else f"Point {k+1} about {topic}")} for k in range(n)]
        s = {"hook": inputs.hook or f"{n} things to know about {topic}", "slides": slides, "cta": options.cta or "Save this", "caption": f"{topic.capitalize()}{tag}", "visual_direction": inputs.visual_direction or "Clean, bold type on brand colors"}
        text = f"{s['hook']}\n\n" + "\n".join(f"{sl['title']}: {sl['body']}" for sl in slides) + f"\n\nCTA: {s['cta']}"
        return s["hook"], text, s
    if ct == ContentType.REWRITE:
        base = inputs.original_content or "your content"
        text = f"[{inputs.transformation or 'rewritten'} · {tone}{label}]\n\n{base.strip()[:400]}\n\n{options.cta or ''}".strip()
        return f"Rewrite: {inputs.transformation or 'edit'}", text, {}
    return topic, f"Sample content about {topic}.", {}


def _mock(ct: ContentType, inputs: GenerationInputs, options: GenerationOptions) -> List[GeneratedVariation]:
    out = []
    for i in range(options.variations):
        title, text, structured = _mock_variation(ct, inputs, options, i)
        out.append(GeneratedVariation(index=i, title=title, text=text, structured=structured if ct in STRUCTURED_TYPES or structured else {}))
    return out


def _render_structured_text(ct: ContentType, s: dict) -> str:
    """A readable plain-text rendering of a structured payload (so the ``text``
    field is populated alongside the preserved ``structured`` object)."""
    if ct == ContentType.AD_COPY:
        return "\n".join(x for x in [s.get("headline", ""), s.get("primary_text", ""), s.get("description", ""),
                                     f"CTA: {s.get('cta', '')}" if s.get("cta") else ""] if x)
    if ct == ContentType.SEO_CONTENT:
        secs = "\n\n".join(f"{x.get('heading','')}\n{x.get('body','')}" for x in (s.get("sections") or []) if isinstance(x, dict))
        return "\n\n".join(x for x in [s.get("h1", ""), s.get("meta_description", ""), secs] if x)
    if ct == ContentType.CAROUSEL:
        slides = "\n".join(f"{sl.get('title','')}: {sl.get('body','')}" for sl in (s.get("slides") or []) if isinstance(sl, dict))
        return "\n\n".join(x for x in [s.get("hook", ""), slides, f"CTA: {s.get('cta','')}" if s.get("cta") else "", s.get("caption", "")] if x)
    return json.dumps(s, ensure_ascii=False, indent=2)


def _parse_structured(ct: ContentType, text: str) -> dict:
    """Strict JSON parse + required-key validation for a structured type. Raises
    a MALFORMED_OUTPUT ProviderError on failure (the model layer already does one
    bounded JSON-repair; this is the final schema gate)."""
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        raise ProviderError(ErrorCategory.MALFORMED_OUTPUT, "structured output was not valid JSON")
    if not isinstance(data, dict):
        raise ProviderError(ErrorCategory.MALFORMED_OUTPUT, "structured output was not a JSON object")
    required = structured_schema(ct).get("required", [])
    missing = [k for k in required if k not in data or data[k] in (None, "", [], {})]
    if missing:
        raise ProviderError(ErrorCategory.MALFORMED_OUTPUT, f"structured output missing keys: {missing}")
    return data


def _real(ct: ContentType, inputs: GenerationInputs, options: GenerationOptions) -> Tuple[List[GeneratedVariation], UsageMeta]:
    """Real-provider generation. Produces DISTINCT variations via bounded calls
    (never uncontrolled fan-out), parses+validates structured output, and sums
    real token/cost usage across the calls. Never falls back to mock: an
    unconfigured/failed provider raises a classified :class:`ProviderError`."""
    n = max(1, min(MAX_VARIATIONS, int(options.variations or 1)))
    expects_json = ct in STRUCTURED_TYPES
    # Ask each call for ONE item (bounded parallel) so each completion is a single,
    # cleanly-parseable variation. A per-call nonce nudges the model toward variety.
    single_opts = options.model_copy(update={"variations": 1})
    base_prompt = build_prompt(ct, inputs.model_dump(), single_opts.model_dump())

    try:
        import asyncio

        from models import ModelRequest, get_router  # type: ignore
        from schemas import ModelTier  # type: ignore

        router = get_router()

        async def _run_all():
            reqs = [
                ModelRequest(
                    tier=ModelTier.LARGE,
                    task=f"content_agent:{ct.value}",
                    system="You are an expert marketing content writer. Return exactly what is requested.",
                    user=base_prompt + (f"\n\n(Variation {i + 1} of {n} — make this option meaningfully different.)" if n > 1 else ""),
                    expects_json=expects_json,
                )
                for i in range(n)
            ]
            return await asyncio.gather(*[router.complete(r) for r in reqs])
    except ImportError as exc:
        # The model layer isn't importable at all (e.g. stdlib-only env) → not configured.
        raise ProviderUnavailable(f"model layer unavailable: {type(exc).__name__}")

    try:
        results = asyncio.run(_run_all())
    except ProviderError:
        raise
    except Exception as exc:  # network / auth / rate-limit / timeout → classify safely
        raise ProviderError(classify(exc).category, f"{type(exc).__name__}: {exc}")

    variations: List[GeneratedVariation] = []
    total_tokens = 0
    total_cost = 0.0
    model = ""
    for i, result in enumerate(results):
        text = (getattr(result, "text", "") or "").strip()
        if not text:
            raise ProviderError(ErrorCategory.TEMPORARY_PROVIDER_FAILURE, "empty completion from provider")
        model = getattr(result, "model", "") or model
        total_tokens += int(getattr(result, "tokens_in", 0) or 0) + int(getattr(result, "tokens_out", 0) or 0)
        total_cost += float(getattr(result, "cost_usd", 0.0) or 0.0)
        structured: dict = {}
        if expects_json:
            structured = _parse_structured(ct, text)
            text = _render_structured_text(ct, structured) or text
        title = (structured.get("headline") or structured.get("h1") or structured.get("hook")
                 or inputs.title or f"{ct.value.replace('_', ' ').title()} {i + 1}")
        variations.append(GeneratedVariation(index=i, title=str(title)[:120], text=text, structured=structured))

    provider = getattr(getattr(router, "_provider", None), "name", "") or model_mode()
    usage = UsageMeta(provider=provider, model=model, mock=False, tokens=total_tokens,
                      estimated_cost=round(total_cost, 6), prompt_version=PROMPT_VERSION)
    return variations, usage


def generate(ct: ContentType, inputs: GenerationInputs, options: GenerationOptions) -> GenerationResult:
    if is_mock():
        variations = _mock(ct, inputs, options)
        usage = UsageMeta(provider="mock", model="mock", mock=True, prompt_version=PROMPT_VERSION)
    else:
        variations, usage = _real(ct, inputs, options)
    # structured types must carry a structured payload
    if ct in STRUCTURED_TYPES and is_mock():
        for v in variations:
            assert v.structured, "structured type must produce a structured payload"
    return GenerationResult(content_type=ct, variations=variations, usage=usage)
