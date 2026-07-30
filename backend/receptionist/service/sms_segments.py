"""SMS encoding + segmentation analysis (Part 12).

A dedicated utility so length/segment logic lives in ONE place (not scattered in
handlers or the model). Determines GSM-7 vs UCS-2 encoding and the resulting
segment count under standard SMS concatenation rules, so the UI can show a segment
estimate before approval and billing can reserve a conservative segment count. The
model never selects segmentation directly.
"""

from __future__ import annotations

# GSM 03.38 basic character set (single-unit chars). Extension chars ( ^{}\[~]|€ )
# occupy two units each; we count them as two below.
_GSM_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑܧ¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM_EXTENDED = set("^{}\\[~]|€")

# Single-message and concatenated-segment capacities.
_GSM7_SINGLE, _GSM7_MULTI = 160, 153
_UCS2_SINGLE, _UCS2_MULTI = 70, 67


def _is_gsm7(text: str) -> bool:
    return all((c in _GSM_BASIC or c in _GSM_EXTENDED) for c in text)


def _gsm7_units(text: str) -> int:
    return sum(2 if c in _GSM_EXTENDED else 1 for c in text)


def analyze(text: str) -> dict:
    """Return encoding, unit length, and estimated segment count for ``text``."""
    text = text or ""
    if _is_gsm7(text):
        encoding = "GSM-7"
        units = _gsm7_units(text)
        single, multi = _GSM7_SINGLE, _GSM7_MULTI
    else:
        encoding = "UCS-2"
        # UCS-2 counts UTF-16 code units; astral chars take 2.
        units = sum(2 if ord(c) > 0xFFFF else 1 for c in text)
        single, multi = _UCS2_SINGLE, _UCS2_MULTI

    if units == 0:
        segments = 0
    elif units <= single:
        segments = 1
    else:
        segments = -(-units // multi)  # ceil division into concatenated segments

    return {
        "encoding": encoding,
        "length": units,
        "chars": len(text),
        "segments": segments,
        "single_capacity": single,
        "segment_capacity": multi,
    }


def estimate_segments(text: str) -> int:
    return analyze(text).get("segments", 0)
