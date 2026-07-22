"""Safe provider-error mapping — categories, redaction, no leakage."""

from __future__ import annotations

import pytest

from content_agent.errors import (
    ErrorCategory,
    ProviderError,
    classify,
    new_correlation_id,
    redact,
)


@pytest.mark.parametrize("text,expected", [
    ("OPENAI_API_KEY is missing. Add it to backend environment variables.", ErrorCategory.PROVIDER_NOT_CONFIGURED),
    ("Incorrect API key provided", ErrorCategory.INVALID_CREDENTIALS),
    ("Error code: 429 - rate limit reached", ErrorCategory.RATE_LIMITED),
    ("You exceeded your current quota (insufficient_quota)", ErrorCategory.QUOTA_EXCEEDED),
    ("The model `gpt-9` does not exist", ErrorCategory.UNSUPPORTED_MODEL),
    ("Request timed out", ErrorCategory.PROVIDER_TIMEOUT),
    ("OpenAI returned invalid JSON twice", ErrorCategory.MALFORMED_OUTPUT),
    ("flagged by content policy", ErrorCategory.CONTENT_POLICY),
    ("job failed during rendering", ErrorCategory.JOB_FAILED),
    ("the job has expired", ErrorCategory.JOB_EXPIRED),
    ("storage bucket write failed", ErrorCategory.STORAGE_FAILURE),
    ("something totally unexpected", ErrorCategory.UNKNOWN),
])
def test_classify_maps_known_strings(text, expected):
    assert classify(text).category is expected


def test_retryable_only_for_transient():
    assert classify("rate limit").retryable is True
    assert classify("timed out").retryable is True
    assert classify("Incorrect API key").retryable is False
    assert classify("provider not configured").retryable is False


def test_http_status_mapping():
    assert classify("rate limit").http_status == 429
    assert classify("provider not configured").http_status == 503
    assert classify("insufficient_quota").http_status == 402


def test_explicit_category_wins():
    err = ProviderError(ErrorCategory.JOB_EXPIRED, internal="raw provider detail with token=abc123")
    safe = classify(err)
    assert safe.category is ErrorCategory.JOB_EXPIRED


def test_to_detail_is_browser_safe():
    safe = classify("Incorrect API key sk-secret-123", correlation_id="err_test")
    d = safe.to_detail()
    assert d["status"] == "invalid_credentials"
    assert d["correlation_id"] == "err_test"
    # the safe message never echoes the raw provider text / secret
    assert "sk-secret-123" not in d["message"]
    assert "api key" not in d["message"].lower() or "rejected" in d["message"].lower()


def test_redact_strips_secrets():
    assert "sk-abc123" not in redact("openai api_key=sk-abc123 failed")
    assert "<redacted>" in redact("authorization: Bearer sk-xyz")
    assert redact("HIGGSFIELD_API_SECRET=topsecret").endswith("<redacted>")


def test_correlation_ids_unique():
    assert new_correlation_id() != new_correlation_id()
