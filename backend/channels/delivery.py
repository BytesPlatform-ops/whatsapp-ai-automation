"""Idempotency-aware delivery helper: retry-with-exponential-backoff (Wave 3).

`send_with_retry` wraps a zero-arg `send_fn` that returns a `SendResult`. On a
*transient* failure it retries up to `max_attempts` with exponential backoff,
calling an injected `sleep` (default: no-op, so tests never actually sleep). The
number of attempts made is stashed in `result.preview["_attempts"]`.

Non-transient failures (e.g. `mock_mode`, `live_not_wired`) are NEVER retried —
retrying a deterministic mock or an unwired channel is pointless. Successes are
returned immediately.
"""

from __future__ import annotations

from typing import Callable, List, Optional

from .schemas import SendResult


#: Reasons that warrant a retry. Deliberately EXCLUDES `mock_mode` /
#: `live_not_wired` (deterministic, not flaky) and any business-rule block.
TRANSIENT_REASONS: frozenset[str] = frozenset(
    {"timeout", "rate_limited", "temporary_error", "provider_5xx"}
)


def _default_is_transient(result: SendResult) -> bool:
    return (not result.ok) and (result.reason in TRANSIENT_REASONS)


def _noop_sleep(_seconds: float) -> None:  # pragma: no cover - trivial
    return None


def backoff_delays(max_attempts: int, base_delay: float = 0.5, factor: float = 2.0) -> List[float]:
    """The delay schedule between attempts: base_delay * factor**i for the gaps.

    For `max_attempts` total attempts there are `max_attempts - 1` gaps, e.g.
    backoff_delays(3) == [0.5, 1.0, 2.0] (the 3rd entry is the delay that WOULD
    precede a 4th attempt, kept for schedule introspection/symmetry).
    """
    return [base_delay * (factor ** i) for i in range(max(max_attempts, 0))]


def send_with_retry(
    send_fn: Callable[[], SendResult],
    *,
    max_attempts: int = 3,
    base_delay: float = 0.5,
    factor: float = 2.0,
    sleep: Callable[[float], None] | None = None,
    is_transient: Callable[[SendResult], bool] | None = None,
) -> SendResult:
    """Call `send_fn`, retrying transient failures with exponential backoff.

    Returns the last `SendResult`. `result.preview["_attempts"]` carries how many
    times `send_fn` was invoked. The injected `sleep` is called once before each
    retry with `base_delay * factor**attempt` (attempt = 0-based retry index), so
    a passing test can assert it was called `attempts - 1` times.
    """
    _sleep = sleep if sleep is not None else _noop_sleep
    _is_transient = is_transient if is_transient is not None else _default_is_transient
    attempts = max(max_attempts, 1)

    result: Optional[SendResult] = None
    for attempt in range(attempts):
        result = send_fn()
        made = attempt + 1
        if result.ok or not _is_transient(result):
            break
        if made >= attempts:
            break
        _sleep(base_delay * (factor ** attempt))

    # Stash attempt count without losing any existing preview payload.
    preview = dict(result.preview) if result.preview else {}
    preview["_attempts"] = made
    result.preview = preview
    return result
