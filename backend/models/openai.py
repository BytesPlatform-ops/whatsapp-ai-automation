"""OpenAIProvider — the REAL AI brain (production).

Implements the same `Provider` protocol as `FakeProvider`, so nothing above the
`models/` layer changes when we swap fake → openai. The key is read from the
backend environment ONLY (`OPENAI_API_KEY`) and used server-side via the official
async SDK; it is never returned upstream or exposed to any frontend.

Behaviour required by the spec:
  - read OPENAI_API_KEY + OPENAI_MODEL from env (server-side)
  - structured JSON output when `req.expects_json` (json_object response format)
  - low/moderate temperature
  - validate returned JSON; on invalid JSON attempt exactly ONE repair call;
    if still invalid, raise a clear error (never silently fall back to a template)
  - real token counts + latency so cost metering stays accurate
"""

from __future__ import annotations

import json
import os
from time import perf_counter

from .base import ModelRequest, ModelResult, estimate_tokens

# Clear, actionable message the API/service surfaces verbatim when the key is absent.
MISSING_KEY_MESSAGE = "OPENAI_API_KEY is missing. Add it to backend environment variables."

# Nudge that guarantees the literal token "json" is present in the request, which
# the OpenAI json_object response_format requires, and pins single-object output.
_JSON_SUFFIX = "\n\nRespond with a single valid JSON object and nothing else."


class OpenAIProvider:
    """A thin, provider-shaped wrapper over the official OpenAI async SDK."""

    name = "openai"

    def __init__(self, api_key: str | None = None, *, timeout: float = 40.0) -> None:
        # Resolve lazily: importing/registering the provider must NOT require a key
        # (so fake-mode boots fine); the key is only mandatory at call time.
        self._api_key = api_key if api_key is not None else os.getenv("OPENAI_API_KEY", "")
        self._timeout = timeout
        self._client = None  # built on first use

    def _ensure_client(self):
        if not self._api_key:
            raise RuntimeError(MISSING_KEY_MESSAGE)
        if self._client is None:
            from openai import AsyncOpenAI  # imported here so no key ⇒ no hard dep at import

            self._client = AsyncOpenAI(api_key=self._api_key, timeout=self._timeout)
        return self._client

    async def _call(self, *, model: str, system: str, user: str, expects_json: bool,
                    temperature: float) -> tuple[str, int, int]:
        client = self._ensure_client()
        kwargs: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }
        if expects_json:
            kwargs["response_format"] = {"type": "json_object"}
        resp = await client.chat.completions.create(**kwargs)
        text = (resp.choices[0].message.content or "").strip()
        usage = getattr(resp, "usage", None)
        tokens_in = getattr(usage, "prompt_tokens", None)
        tokens_out = getattr(usage, "completion_tokens", None)
        # Fall back to estimates only if the API somehow omits usage.
        if tokens_in is None:
            tokens_in = estimate_tokens(system) + estimate_tokens(user)
        if tokens_out is None:
            tokens_out = estimate_tokens(text)
        return text, int(tokens_in), int(tokens_out)

    async def complete(self, req: ModelRequest, *, model: str) -> ModelResult:
        start = perf_counter()
        system = req.system + (_JSON_SUFFIX if req.expects_json else "")
        temperature = 0.3 if req.expects_json else 0.6

        text, tin, tout = await self._call(
            model=model, system=system, user=req.user,
            expects_json=req.expects_json, temperature=temperature,
        )

        # JSON validation + one repair attempt (spec §6). Only when JSON is expected.
        if req.expects_json and not _is_valid_json(text):
            repair_system = (
                "You return ONLY a single valid JSON object. The previous output was "
                "not valid JSON. Re-emit the SAME content as strict, parseable JSON. "
                "No markdown, no prose, no code fences."
            )
            rtext, rtin, rtout = await self._call(
                model=model, system=repair_system, user=text,
                expects_json=True, temperature=0.0,
            )
            tin += rtin
            tout += rtout
            if not _is_valid_json(rtext):
                raise ValueError(
                    "OpenAI returned invalid JSON twice (original + repair). "
                    "No fallback template was used."
                )
            text = rtext

        latency_ms = int((perf_counter() - start) * 1000)
        return ModelResult(
            text=text, model=model, tier=req.tier,
            tokens_in=tin, tokens_out=tout, latency_ms=latency_ms,
        )


def _is_valid_json(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except (ValueError, TypeError):
        return False
