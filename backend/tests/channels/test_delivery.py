"""send_with_retry / backoff_delays tests — injected no-op sleep, no real time.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
"""

from __future__ import annotations

from channels.delivery import backoff_delays, send_with_retry
from channels.schemas import Channel, SendResult


def _fail(reason: str) -> SendResult:
    return SendResult(ok=False, channel=Channel.WHATSAPP, recipient_id="+100", reason=reason)


def _ok() -> SendResult:
    return SendResult(ok=True, channel=Channel.WHATSAPP, recipient_id="+100", sent=True, reason="")


class _SleepSpy:
    def __init__(self) -> None:
        self.calls: list[float] = []

    def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def test_transient_twice_then_success():
    seq = [_fail("timeout"), _fail("rate_limited"), _ok()]
    sleep = _SleepSpy()

    def send_fn() -> SendResult:
        return seq.pop(0)

    res = send_with_retry(send_fn, max_attempts=3, sleep=sleep)
    assert res.ok is True
    assert res.preview["_attempts"] == 3
    # slept before the 2nd and 3rd attempts only
    assert len(sleep.calls) == 2
    assert sleep.calls == [0.5, 1.0]


def test_permanent_transient_exhausts():
    sleep = _SleepSpy()

    def send_fn() -> SendResult:
        return _fail("timeout")

    res = send_with_retry(send_fn, max_attempts=3, sleep=sleep)
    assert res.ok is False
    assert res.reason == "timeout"
    assert res.preview["_attempts"] == 3
    # slept between each of the 3 attempts (twice)
    assert len(sleep.calls) == 2


def test_non_transient_not_retried():
    sleep = _SleepSpy()
    calls = {"n": 0}

    def send_fn() -> SendResult:
        calls["n"] += 1
        return _fail("mock_mode")

    res = send_with_retry(send_fn, max_attempts=3, sleep=sleep)
    assert res.ok is False
    assert res.reason == "mock_mode"
    assert calls["n"] == 1
    assert res.preview["_attempts"] == 1
    assert sleep.calls == []


def test_backoff_schedule():
    assert backoff_delays(3) == [0.5, 1.0, 2.0]
