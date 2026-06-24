"""OpenAIProvider — real model calls via the Chat Completions API (async httpx).

Reads `OPENAI_API_KEY` from the environment (call from the backend, never the
browser). Used when `PIXIE_MODEL_MODE=openai`. Returns the same `ModelResult`
shape as the fake provider, so the parallel builder/orchestrator don't change.
"""

from __future__ import annotations

import os
from time import perf_counter

import httpx

from schemas import ModelTier

from .base import ModelRequest, ModelResult, Provider, estimate_tokens

_API_URL = "https://api.openai.com/v1/chat/completions"

# Token ceilings per task — full sections need room; the planner is small.
_MAX_TOKENS = {"plan_site": 1200, "build_section": 3000, "build": 8000, "edit": 8000, "firewall": 200}


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str | None = None, timeout_s: float = 90.0) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.timeout_s = timeout_s

    async def complete(self, req: ModelRequest, *, model: str) -> ModelResult:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not set — cannot call OpenAI (set it in the backend env).")

        messages = []
        if req.system:
            messages.append({"role": "system", "content": req.system})
        messages.append({"role": "user", "content": req.user})

        body: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": _MAX_TOKENS.get(req.task, 4000),
        }
        # Ask for strict JSON where the caller parses JSON (planner, firewall).
        if req.expects_json and req.task in ("plan_site", "firewall", "classify", "build", "edit"):
            body["response_format"] = {"type": "json_object"}

        t0 = perf_counter()
        async with httpx.AsyncClient(timeout=self.timeout_s) as client:
            resp = await client.post(
                _API_URL,
                headers={"authorization": f"Bearer {self.api_key}", "content-type": "application/json"},
                json=body,
            )
        latency_ms = int((perf_counter() - t0) * 1000)

        if resp.status_code != 200:
            raise RuntimeError(f"OpenAI {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        return ModelResult(
            text=text,
            model=model,
            tier=req.tier,
            tokens_in=usage.get("prompt_tokens", estimate_tokens(req.system + req.user)),
            tokens_out=usage.get("completion_tokens", estimate_tokens(text)),
            latency_ms=latency_ms,
        )


_: Provider = OpenAIProvider(api_key="x")
