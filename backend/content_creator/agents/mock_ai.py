"""Deterministic mock AI — PURE STDLIB.

Stands in for the shared model layer when PIXIE_MODEL_MODE=fake (the default) or
when the model layer is unavailable. Output is a pure function of the input
(sha1-seeded) so tests are reproducible and every call is $0. The real model
path (Wave 2 agents) goes through models.get_router(); this is the fallback.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List


def _seed(text: str) -> int:
    return int(hashlib.sha1((text or "").encode("utf-8")).hexdigest(), 16)


def mock_ideas(topic: str, brand: str = "", n: int = 5) -> List[Dict]:
    """Deterministic ranked reel ideas."""
    angles = ["myth-bust", "before/after", "quick tip", "behind-the-scenes",
              "customer story", "common mistake", "fast how-to", "trend reaction"]
    hooks = ["Stop scrolling —", "Nobody tells you this:", "3 seconds to a better",
             "The truth about", "Watch this before you", "Here's why your"]
    out = []
    for i in range(max(1, n)):
        s = _seed("%s|%s|%d" % (topic, brand, i))
        angle = angles[s % len(angles)]
        hook = hooks[(s // 7) % len(hooks)]
        score = 55 + (s % 45)  # 55..99, deterministic
        out.append({
            "title": "%s %s (%s)" % (hook, topic or "your service", angle),
            "angle": angle,
            "hook": hook,
            "score": score,
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out


def mock_script(idea: Dict, tone: str = "friendly", language: str = "en") -> Dict:
    """~15s AIDA short-form script, deterministic, 38-48 words."""
    hook = idea.get("hook", "Watch this:")
    topic = idea.get("title", "your offer")
    body = (
        "%s most people get %s wrong. Here's the fix in fifteen seconds: do it "
        "the simple way, skip the fluff, and you'll see results fast. We make it "
        "effortless for you." % (hook, topic.split("(")[0].strip().lower())
    )
    cta = "Tap the link and book today."
    words = len((body + " " + cta).split())
    return {
        "hook": hook,
        "body": body,
        "cta": cta,
        "tone": tone,
        "language": language,
        "word_count": words,
        "approx_seconds": 15,
        "structure": "AIDA",
    }


def mock_quality_review(video: Dict) -> Dict:
    """Optional LLM-style review — deterministic flags from the video ref."""
    s = _seed(str(video.get("asset_ref", "")))
    flags = []
    catalog = ["face_drift", "lip_sync_issue", "robotic_voice", "gesture_loop",
               "hand_distortion", "camera_drift", "fake_background",
               "duration_mismatch", "brand_mismatch", "cta_missing"]
    # Deterministically surface 0-1 soft flags so the retry ladder is exercisable.
    if s % 5 == 0:
        flags.append(catalog[(s // 5) % len(catalog)])
    return {"llm_flags": flags, "reviewed": True}


def mock_learning(metrics: List[Dict]) -> Dict:
    """Deterministic learning summary over collected metrics."""
    n = len(metrics or [])
    avg_views = (sum(int(m.get("views", 0)) for m in (metrics or [])) // n) if n else 0
    return {
        "samples": n,
        "avg_views": avg_views,
        "insights": [
            "Hooks that open with a question retained viewers longer.",
            "Shorter CTAs converted better than multi-step asks.",
            "Posting mid-morning outperformed late-night for this niche.",
        ],
        "next_focus": "Double down on myth-bust + quick-tip angles.",
    }
