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
import os
from typing import List, Tuple

from .enums import STRUCTURED_TYPES, ContentType
from .prompts import PROMPT_VERSION, build_prompt, structured_schema
from .schemas import GeneratedVariation, GenerationInputs, GenerationOptions, GenerationResult, UsageMeta


class ProviderUnavailable(RuntimeError):
    """Real mode requested but no usable model provider is configured."""


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


def _real(ct: ContentType, inputs: GenerationInputs, options: GenerationOptions) -> Tuple[List[GeneratedVariation], UsageMeta]:
    prompt = build_prompt(ct, inputs.model_dump(), options.model_dump())
    try:
        import asyncio
        from models import ModelRequest, get_router  # type: ignore
        from schemas import ModelTier  # type: ignore

        router = get_router()
        req = ModelRequest(tier=ModelTier.LARGE, task=f"content_agent:{ct.value}",
                           system="You are a marketing content writer. Return the requested content.",
                           user=prompt, expects_json=ct in STRUCTURED_TYPES)
        result = asyncio.run(router.complete(req))
        text = (getattr(result, "text", "") or "").strip()
        if not text:
            raise ProviderUnavailable("Empty completion from provider.")
        provider = getattr(getattr(router, "_provider", None), "name", "") or model_mode()
        usage = UsageMeta(provider=provider, model=getattr(result, "model", "") or "", mock=False,
                          tokens=int(getattr(result, "tokens", 0) or 0),
                          estimated_cost=float(getattr(result, "cost_usd", 0.0) or 0.0), prompt_version=PROMPT_VERSION)
        variations = [GeneratedVariation(index=i, title=f"{ct.value} {i+1}", text=text) for i in range(options.variations)]
        return variations, usage
    except ProviderUnavailable:
        raise
    except Exception as exc:  # not configured / import error / bad response
        raise ProviderUnavailable(f"Content provider unavailable in real mode: {type(exc).__name__}")


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
