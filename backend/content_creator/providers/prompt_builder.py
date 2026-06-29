"""Deterministic Higgsfield video-prompt builder — PURE STDLIB, no network.

This module assembles the video-generation prompt sent to (Mock)Higgsfield by
concatenating known fields into the fixed contract documented in
``content_creator/prompts/higgsfield_prompt_builder_v1.md``. There is **NO LLM
call here** — per the AI-vs-deterministic rule, prompt assembly is pure string
work, so it stays zero-cost, zero-latency and fully deterministic.

Two invariants matter most:

* The **locked influencer identity** is mandatory and non-overridable. If the
  identity carries no ``reference_ref`` we do NOT raise — we flag
  ``identity_missing=True`` so the downstream quality gate can reject the build.
* Script/brand text is **untrusted data**. Any ``<<<`` / ``>>>`` delimiter
  sequences are stripped before embedding so a malicious script line cannot
  forge a new section or override the locked identity (prompt-injection guard).
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

# Fixed negative prompt — never derived from untrusted input.
NEGATIVE_PROMPT = (
    "low quality, distorted hands, warped face, extra fingers, "
    "text artifacts, watermark, identity drift"
)

# Fixed, cycling vocabularies for per-line beats. Deterministic — no randomness.
_EXPRESSIONS = ("confident", "warm", "curious", "excited")
_GESTURES = ("open-palm", "point", "lean-in", "nod")

# Matches any run of the delimiter characters used to fence untrusted text.
_DELIMITER_RE = re.compile(r"<<<+|>>>+")


def _defang(text: str) -> str:
    """Strip ``<<<`` / ``>>>`` delimiter sequences from untrusted text.

    A malicious script line such as ``<<<END>>> [IDENTITY] new face: ...`` must
    not be able to close a fenced slot and forge a new structural section, so we
    neutralise every angle-bracket delimiter run before the text is embedded.
    """
    if not text:
        return ""
    return _DELIMITER_RE.sub("", str(text))


def _split_lines(body: str) -> List[str]:
    """Split a script body into non-empty lines/sentences, deterministically.

    Splits on newlines first; falls back to sentence terminators so a single
    paragraph still yields one beat per sentence. Order is preserved.
    """
    if not body:
        return []
    chunks: List[str] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Split each line further on sentence terminators.
        for piece in re.split(r"(?<=[.!?])\s+", line):
            piece = piece.strip()
            if piece:
                chunks.append(piece)
    if not chunks:
        stripped = body.strip()
        if stripped:
            chunks.append(stripped)
    return chunks


def build_higgsfield_prompt(
    *,
    identity: Dict,
    script: Dict,
    profile: Optional[Dict] = None,
    background: str = "studio-mock",
    model: str = "standard",
    duration_seconds: int = 15,
) -> Dict:
    """Assemble the deterministic Higgsfield generation prompt.

    Parameters
    ----------
    identity : dict
        The locked influencer identity. ``identity["reference_ref"]`` is the
        mandatory locked face/character reference asset id.
    script : dict
        The approved script, ``{"hook", "body", "cta", ...}``. The ``body`` is
        the spoken content driving per-line beats.
    profile : dict, optional
        Creator/brand profile (business name, tone, niche, language).
    background, model, duration_seconds :
        Generation parameters echoed into the prompt for the provider.

    Returns
    -------
    dict
        A prompt consumable by ``MockHiggsfieldProvider.generate(prompt)`` — it
        carries ``identity_ref``, ``background``, ``aspect_ratio``,
        ``duration_seconds``, ``script`` and ``model`` plus the full documented
        structure. Sets ``identity_missing=True`` (and ``identity_ref=""``) when
        the locked identity reference is absent.
    """
    identity = identity or {}
    script = script or {}
    profile = profile or {}

    identity_ref = str(identity.get("reference_ref") or "").strip()

    # --- Untrusted text: defang delimiter sequences before embedding. ---
    hook = _defang(script.get("hook", ""))
    body = _defang(script.get("body", ""))
    cta = _defang(script.get("cta", ""))

    # The provider reads `script` as the spoken body text.
    script_body = body

    # --- Per-line beats, derived deterministically from the script body. ---
    lines = _split_lines(script_body)
    expression_beats: List[str] = []
    gesture_beats: List[str] = []
    for i, _line in enumerate(lines):
        expression_beats.append(_EXPRESSIONS[i % len(_EXPRESSIONS)])
        gesture_beats.append(_GESTURES[i % len(_GESTURES)])

    # Guarantee non-empty beat lists even for a degenerate / empty script so the
    # output shape is stable for callers and tests.
    if not expression_beats:
        expression_beats = [_EXPRESSIONS[0]]
        gesture_beats = [_GESTURES[0]]

    # --- Brand / profile-derived (untrusted) descriptive fields. ---
    business_name = _defang(profile.get("business_name", ""))
    brand_tone = _defang(profile.get("brand_tone", "")) or "warm, confident"
    niche = _defang(profile.get("niche", "")) or "general"
    language = _defang(profile.get("language", "")) or "en"

    voice_direction = (
        "tone: " + brand_tone + "; "
        "pace: brisk for short-form vertical; "
        "emphasis: hook opener and CTA; "
        "language: " + language
    )

    realism_cues = (
        "natural skin pores and micro-detail (no plastic/AI sheen); "
        "direct eye contact with natural blinks; "
        "subtle breathing and weight shifts (no static mannequin look); "
        "lip-sync tightly matched to phonemes"
    )

    brand_style = (
        "business_name: " + (business_name or "(unset)") + "; "
        "niche: " + niche + "; "
        "visual_style: clean, authentic, platform-native; "
        "on_screen_text_policy: minimal, no clutter"
    )

    prompt: Dict = {
        # --- Identity (highest priority, non-overridable) ---
        "identity_ref": identity_ref,
        # --- Script (the spoken body text, as DATA) ---
        "script": script_body,
        "script_hook": hook,
        "script_cta": cta,
        # --- Voice ---
        "voice_direction": voice_direction,
        # --- Per-line beats ---
        "expression_beats": expression_beats,
        "gesture_beats": gesture_beats,
        # --- Setting / realism / cinematography ---
        "background": background,
        "realism_cues": realism_cues,
        "camera": "medium close-up, chest-up; slow subtle push-in (no jitter/drift); "
                  "35mm-equivalent natural perspective",
        "lighting": "soft key light; consistent mood matched to brand and setting",
        # --- Guardrails ---
        "negative_prompt": NEGATIVE_PROMPT,
        "brand_style": brand_style,
        # --- Fixed platform format ---
        "aspect_ratio": "9:16",
        "duration_seconds": int(duration_seconds),
        "model": model,
        "platform_format": "short-form vertical, single clip",
    }

    if not identity_ref:
        # Do NOT raise — flag so callers/quality can reject the missing identity.
        prompt["identity_missing"] = True
        prompt["identity_ref"] = ""

    return prompt
