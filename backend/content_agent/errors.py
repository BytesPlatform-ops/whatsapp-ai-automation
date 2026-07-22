"""Safe provider-error mapping for the content products.

Normalizes any provider/model/storage failure into a small set of stable
categories with a browser-safe message, a retry hint, and an HTTP status — WITHOUT
leaking raw provider payloads, request headers, credentials, or stack traces. A
short correlation id is generated so server logs can be tied to a user-facing
error without exposing internals.

Both the General Content Agent and the AI Influencer map through here so the
frontend sees one consistent, redacted error contract.

PURE STDLIB.
"""

from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from enum import Enum


class ErrorCategory(str, Enum):
    PROVIDER_NOT_CONFIGURED = "provider_not_configured"
    INVALID_CREDENTIALS = "invalid_credentials"
    PERMISSION_DENIED = "permission_denied"
    RATE_LIMITED = "rate_limited"
    QUOTA_EXCEEDED = "quota_exceeded"
    INVALID_REQUEST = "invalid_request"
    UNSUPPORTED_MODEL = "unsupported_model"
    UNSUPPORTED_MEDIA = "unsupported_media"
    PROVIDER_TIMEOUT = "provider_timeout"
    TEMPORARY_PROVIDER_FAILURE = "temporary_provider_failure"
    MALFORMED_OUTPUT = "malformed_output"
    CONTENT_POLICY = "content_policy"
    JOB_FAILED = "job_failed"
    JOB_EXPIRED = "job_expired"
    STORAGE_FAILURE = "storage_failure"
    UNKNOWN = "unknown_provider_failure"


# Category → (safe user message, HTTP status, retryable). Retryable is only true
# for transient conditions — NEVER for credential/permission/invalid-request
# failures (those must not be auto-retried).
_META: dict[ErrorCategory, tuple[str, int, bool]] = {
    ErrorCategory.PROVIDER_NOT_CONFIGURED: ("The AI provider is not configured. Enable mock mode or add provider credentials.", 503, False),
    ErrorCategory.INVALID_CREDENTIALS: ("The AI provider rejected the configured credentials.", 502, False),
    ErrorCategory.PERMISSION_DENIED: ("The AI provider denied permission for this request.", 502, False),
    ErrorCategory.RATE_LIMITED: ("The AI provider is rate limiting requests. Please try again shortly.", 429, True),
    ErrorCategory.QUOTA_EXCEEDED: ("The AI provider quota has been exceeded.", 402, False),
    ErrorCategory.INVALID_REQUEST: ("The generation request was rejected as invalid.", 400, False),
    ErrorCategory.UNSUPPORTED_MODEL: ("The selected model is not available.", 400, False),
    ErrorCategory.UNSUPPORTED_MEDIA: ("The provided media is not supported for this operation.", 400, False),
    ErrorCategory.PROVIDER_TIMEOUT: ("The AI provider timed out. Please try again.", 504, True),
    ErrorCategory.TEMPORARY_PROVIDER_FAILURE: ("The AI provider had a temporary error. Please try again.", 502, True),
    ErrorCategory.MALFORMED_OUTPUT: ("The AI provider returned malformed output. Please try again.", 502, True),
    ErrorCategory.CONTENT_POLICY: ("The request was rejected by the provider's content policy.", 400, False),
    ErrorCategory.JOB_FAILED: ("The generation job failed.", 502, True),
    ErrorCategory.JOB_EXPIRED: ("The generation job expired before completing.", 502, False),
    ErrorCategory.STORAGE_FAILURE: ("The generated result could not be stored.", 502, True),
    ErrorCategory.UNKNOWN: ("The AI provider had an unexpected error.", 502, False),
}


@dataclass
class SafeError:
    category: ErrorCategory
    message: str
    http_status: int
    retryable: bool
    correlation_id: str

    def to_detail(self) -> dict:
        """Browser-safe HTTPException detail body (no raw payload / no secrets)."""
        return {
            "status": self.category.value,
            "message": self.message,
            "retryable": self.retryable,
            "correlation_id": self.correlation_id,
        }


def new_correlation_id() -> str:
    return "err_" + secrets.token_hex(6)


# Ordered (regex → category). First match wins; patterns intentionally match on
# well-known substrings that providers use, not on any secret material.
_PATTERNS: list[tuple[re.Pattern, ErrorCategory]] = [
    (re.compile(r"not configured|missing.*(key|credential)|OPENAI_API_KEY is missing|provider_not_configured|provider unavailable", re.I), ErrorCategory.PROVIDER_NOT_CONFIGURED),
    (re.compile(r"invalid.*api.*key|incorrect api key|authentication|unauthorized|401", re.I), ErrorCategory.INVALID_CREDENTIALS),
    (re.compile(r"permission|forbidden|403", re.I), ErrorCategory.PERMISSION_DENIED),
    (re.compile(r"rate limit|too many requests|429", re.I), ErrorCategory.RATE_LIMITED),
    (re.compile(r"quota|insufficient_quota|billing", re.I), ErrorCategory.QUOTA_EXCEEDED),
    (re.compile(r"content.{0,3}policy|safety|moderation|flagged", re.I), ErrorCategory.CONTENT_POLICY),
    (re.compile(r"unsupported.*model|model.*not.*found|no such model|does not exist", re.I), ErrorCategory.UNSUPPORTED_MODEL),
    (re.compile(r"unsupported.*(media|image|format)|image.*not.*support", re.I), ErrorCategory.UNSUPPORTED_MEDIA),
    (re.compile(r"malformed|invalid json|not valid json|parse", re.I), ErrorCategory.MALFORMED_OUTPUT),
    (re.compile(r"timeout|timed out|deadline", re.I), ErrorCategory.PROVIDER_TIMEOUT),
    (re.compile(r"expired", re.I), ErrorCategory.JOB_EXPIRED),
    (re.compile(r"job.*fail|generation failed", re.I), ErrorCategory.JOB_FAILED),
    (re.compile(r"storage|bucket|upload failed", re.I), ErrorCategory.STORAGE_FAILURE),
    (re.compile(r"invalid request|bad request|400|422", re.I), ErrorCategory.INVALID_REQUEST),
    (re.compile(r"5\d\d|server error|temporarily|unavailable|connection", re.I), ErrorCategory.TEMPORARY_PROVIDER_FAILURE),
]

# Fields whose values must never appear in a surfaced/log message.
_REDACT_KEYS = re.compile(r"((?:api[_-]?key|secret|authorization|bearer|token|password)\s*[:=]\s*)(\S+)", re.I)


def redact(text: str) -> str:
    """Strip obvious secret-bearing fragments from a string before logging."""
    if not text:
        return ""
    return _REDACT_KEYS.sub(r"\1<redacted>", text)[:500]


def classify(exc_or_text, *, correlation_id: str | None = None) -> SafeError:
    """Map an exception or provider string to a SafeError. Never raises."""
    text = str(exc_or_text or "")
    # Prefer an explicit category attribute when a caller already classified it.
    explicit = getattr(exc_or_text, "category", None)
    category = None
    if isinstance(explicit, ErrorCategory):
        category = explicit
    else:
        for pattern, cat in _PATTERNS:
            if pattern.search(text):
                category = cat
                break
    if category is None:
        category = ErrorCategory.UNKNOWN
    msg, status, retryable = _META[category]
    return SafeError(category=category, message=msg, http_status=status,
                     retryable=retryable, correlation_id=correlation_id or new_correlation_id())


class ProviderError(RuntimeError):
    """A pre-classified provider error carrying a safe category."""

    def __init__(self, category: ErrorCategory, internal: str = "") -> None:
        super().__init__(internal or category.value)
        self.category = category
        self.internal = internal
