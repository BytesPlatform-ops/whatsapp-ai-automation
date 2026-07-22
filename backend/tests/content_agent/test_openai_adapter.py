"""OpenAI adapter behaviour via a MOCKED SDK client (no network, no paid calls).

Verifies: missing-key error, JSON success + usage extraction, and the bounded
one-shot JSON repair. Also an opt-in LIVE smoke test, skipped unless
RUN_LIVE_MODEL_TESTS is truthy.
"""

from __future__ import annotations

import asyncio
import os

import pytest

pytest.importorskip("pydantic")

from models.base import ModelRequest
from models.openai import MISSING_KEY_MESSAGE, OpenAIProvider
from schemas import ModelTier


class _Msg:
    def __init__(self, content):
        self.message = type("M", (), {"content": content})


class _Usage:
    def __init__(self, pin, pout):
        self.prompt_tokens = pin
        self.completion_tokens = pout


class _Resp:
    def __init__(self, content, pin=11, pout=7):
        self.choices = [_Msg(content)]
        self.usage = _Usage(pin, pout)


class _FakeCompletions:
    def __init__(self, script):
        self._script = script
        self.calls = 0

    async def create(self, **kwargs):
        out = self._script[min(self.calls, len(self._script) - 1)]
        self.calls += 1
        return _Resp(out)


class _FakeClient:
    def __init__(self, script):
        self.chat = type("C", (), {"completions": _FakeCompletions(script)})()


def _provider_with(monkeypatch, script):
    prov = OpenAIProvider(api_key="sk-test-not-real")
    client = _FakeClient(script)
    monkeypatch.setattr(prov, "_ensure_client", lambda: client)
    return prov, client


def _complete(prov, expects_json=True, user="u"):
    req = ModelRequest(tier=ModelTier.LARGE, task="t", system="s", user=user, expects_json=expects_json)
    return asyncio.run(prov.complete(req, model="gpt-stub"))


def test_missing_key_raises_clear_message():
    prov = OpenAIProvider(api_key="")
    with pytest.raises(RuntimeError) as ei:
        prov._ensure_client()
    assert ei.value.args[0] == MISSING_KEY_MESSAGE


def test_json_success_extracts_usage(monkeypatch):
    prov, client = _provider_with(monkeypatch, ['{"ok": true}'])
    res = _complete(prov)
    assert res.text == '{"ok": true}'
    assert res.tokens_in == 11 and res.tokens_out == 7
    assert client.chat.completions.calls == 1


def test_one_repair_on_bad_json(monkeypatch):
    # first response invalid, repair response valid → exactly two calls, no raise
    prov, client = _provider_with(monkeypatch, ["not json", '{"fixed": 1}'])
    res = _complete(prov)
    assert res.text == '{"fixed": 1}'
    assert client.chat.completions.calls == 2  # bounded: original + one repair


def test_repair_failure_raises_not_silent(monkeypatch):
    prov, _ = _provider_with(monkeypatch, ["nope", "still nope"])
    with pytest.raises(ValueError):
        _complete(prov)


# ── Opt-in LIVE smoke test (skipped by default; makes ONE minimal real call) ───
def _live_enabled() -> bool:
    return os.getenv("RUN_LIVE_MODEL_TESTS", "").strip().lower() in ("1", "true", "yes", "on")


@pytest.mark.skipif(not _live_enabled(), reason="RUN_LIVE_MODEL_TESTS not set — live model call skipped")
def test_live_minimal_completion():
    print("[live] making ONE minimal OpenAI completion (est. cost < $0.001)")
    prov = OpenAIProvider()
    req = ModelRequest(tier=ModelTier.SMALL, task="live", system="Reply with JSON.", user='Return {"pong": true}', expects_json=True)
    res = asyncio.run(prov.complete(req, model=os.getenv("OPENAI_MODEL", "gpt-4o-mini")))
    assert res.text
