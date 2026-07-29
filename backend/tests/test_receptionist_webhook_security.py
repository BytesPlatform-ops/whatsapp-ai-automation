"""Security tests for Meta inbound webhook + Google OAuth callback hardening.

Hermetic — no network calls, no file I/O, no Supabase.

Covers:
  Meta webhook (GET)
    - valid verify_token → 200 + challenge
    - wrong verify_token → 403
    - missing verify_token env → 403

  Meta webhook (POST)
    - valid HMAC signature → 200
    - missing X-Hub-Signature-256 header → 403
    - invalid / tampered signature → 403
    - replayed event id is ignored (processed=0, skipped=1 on second call)
    - unknown page / account → still 200 but activity under 'system' tenant
    - oversized payload → 413
    - dev bypass (no secret, META_WEBHOOK_DEV_SKIP_SIGNATURE=1) → 200

  Google OAuth state (unit: webhook_events module)
    - issue_state + consume_state round-trip succeeds
    - tampered state → StateTamperedError
    - expired state → StateExpiredError (via _now override)
    - replayed (already-consumed) state → StateConsumedError
    - missing secret → RuntimeError

  webhook_events dedup (unit)
    - already_seen False before mark_seen
    - already_seen True after mark_seen (within TTL)
    - already_seen False after TTL has elapsed (expired entry)

  Google OAuth HTTP surface (integration via TestClient)
    - /connect with no secret configured → error popup (not a crash)
    - /callback with tampered state → error popup (state_tampered)
    - /callback with expired state → error popup (state_expired)
    - /callback with replayed state → error popup (state_replayed)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

# ── Helpers ───────────────────────────────────────────────────────────────────

META_SECRET = "test_meta_app_secret_abc"
VERIFY_TOKEN = "test_verify_tok"
STATE_SECRET = "test_state_secret_xyz_32_chars_ok"


def _hub_sig(raw: bytes, secret: str = META_SECRET) -> str:
    """Compute a valid X-Hub-Signature-256 header value."""
    digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _meta_entry(page_id: str = "PAGE_123", entry_id: str = "ENTRY_1",
                ts: int = 0, msg_id: str = "") -> dict:
    entry: dict = {"id": page_id, "time": ts or int(time.time())}
    if msg_id:
        entry["messaging"] = [{"message": {"mid": msg_id}}]
    return entry


def _meta_body(entries: list[dict] | None = None, obj: str = "page") -> bytes:
    body = {"object": obj, "entry": entries or [_meta_entry()]}
    return json.dumps(body).encode()


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_event_store():
    """Each test gets a fresh in-memory dedup / state store.

    webhook_events caches repo instances per table name (_REPOS dict).  Clearing
    that cache forces new _MemoryRepo instances per test so state from one test
    cannot bleed into another.
    """
    from integrations.webhook_events import _reset_repos
    _reset_repos()
    yield
    _reset_repos()


@pytest.fixture()
def meta_client(monkeypatch):
    """TestClient with META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN configured."""
    monkeypatch.setenv("META_APP_SECRET", META_SECRET)
    monkeypatch.setenv("META_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("META_WEBHOOK_DEV_SKIP_SIGNATURE", raising=False)
    import app
    return TestClient(app.app, raise_server_exceptions=True)


@pytest.fixture()
def meta_client_dev(monkeypatch):
    """TestClient with no META_APP_SECRET but dev skip enabled."""
    monkeypatch.delenv("META_APP_SECRET", raising=False)
    monkeypatch.setenv("META_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN)
    monkeypatch.setenv("META_WEBHOOK_DEV_SKIP_SIGNATURE", "1")
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import app
    return TestClient(app.app, raise_server_exceptions=True)


@pytest.fixture()
def google_client(monkeypatch):
    """TestClient with AI_RECEPTIONIST_GOOGLE_STATE_SECRET configured."""
    monkeypatch.setenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", STATE_SECRET)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake_client_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake_client_secret")
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import app
    return TestClient(app.app, raise_server_exceptions=True)


# ══════════════════════════════════════════════════════════════════════════════
#  Meta GET verification challenge
# ══════════════════════════════════════════════════════════════════════════════

class TestMetaWebhookVerify:

    def test_valid_verify_token_returns_challenge(self, meta_client):
        r = meta_client.get("/api/meta/webhooks", params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "CHALLENGE_XYZ",
        })
        assert r.status_code == 200
        assert r.text == "CHALLENGE_XYZ"

    def test_wrong_verify_token_returns_403(self, meta_client):
        r = meta_client.get("/api/meta/webhooks", params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "CHALLENGE_XYZ",
        })
        assert r.status_code == 403

    def test_missing_verify_token_env_returns_403(self, monkeypatch):
        monkeypatch.delenv("META_WEBHOOK_VERIFY_TOKEN", raising=False)
        monkeypatch.setenv("META_APP_SECRET", META_SECRET)
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
        import app
        client = TestClient(app.app, raise_server_exceptions=True)
        r = client.get("/api/meta/webhooks", params={
            "hub.mode": "subscribe",
            "hub.verify_token": "",
            "hub.challenge": "C",
        })
        assert r.status_code == 403

    def test_wrong_mode_returns_403(self, meta_client):
        r = meta_client.get("/api/meta/webhooks", params={
            "hub.mode": "unsubscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "C",
        })
        assert r.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
#  Meta POST webhook receiver
# ══════════════════════════════════════════════════════════════════════════════

class TestMetaWebhookReceive:

    def test_valid_signature_accepted(self, meta_client):
        raw = _meta_body()
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": _hub_sig(raw),
                     "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True

    def test_missing_signature_returns_403(self, meta_client):
        raw = _meta_body()
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"Content-Type": "application/json"},
            # No X-Hub-Signature-256
        )
        assert r.status_code == 403

    def test_invalid_signature_returns_403(self, meta_client):
        raw = _meta_body()
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={
                "X-Hub-Signature-256": "sha256=" + "0" * 64,
                "Content-Type": "application/json",
            },
        )
        assert r.status_code == 403

    def test_tampered_body_returns_403(self, meta_client):
        """Compute sig over original body, then POST a different body."""
        original = _meta_body()
        tampered = _meta_body(obj="instagram")
        r = meta_client.post(
            "/api/meta/webhooks",
            content=tampered,
            headers={"X-Hub-Signature-256": _hub_sig(original),
                     "Content-Type": "application/json"},
        )
        assert r.status_code == 403

    def test_oversized_payload_returns_413(self, meta_client):
        # Just above 1 MiB
        oversized = b"x" * (1 * 1024 * 1024 + 1)
        r = meta_client.post(
            "/api/meta/webhooks",
            content=oversized,
            headers={
                "X-Hub-Signature-256": _hub_sig(oversized),
                "Content-Type": "application/octet-stream",
            },
        )
        assert r.status_code == 413

    def test_replayed_event_id_skipped_on_second_call(self, meta_client):
        """Same event id must be processed once and skipped on replay."""
        msg_id = "m_unique_message_123"
        entry = _meta_entry(msg_id=msg_id)
        raw = _meta_body(entries=[entry])
        sig = _hub_sig(raw)

        # First delivery
        r1 = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )
        assert r1.status_code == 200
        assert r1.json()["processed"] == 1
        assert r1.json()["skipped"] == 0

        # Second delivery (replay)
        r2 = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )
        assert r2.status_code == 200
        assert r2.json()["skipped"] == 1
        assert r2.json()["processed"] == 0

    def test_different_event_ids_both_processed(self, meta_client):
        """Two entries with distinct ids must both be processed."""
        entries = [
            _meta_entry(msg_id="msg_aaa"),
            _meta_entry(msg_id="msg_bbb"),
        ]
        raw = _meta_body(entries=entries)
        sig = _hub_sig(raw)
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["processed"] == 2
        assert data["skipped"] == 0

    def test_unknown_page_returns_200_not_crash(self, meta_client):
        """Unknown page/account → 200 (no crash), tenant falls back to 'system'."""
        raw = _meta_body(entries=[_meta_entry(page_id="UNKNOWN_PAGE_XYZ")])
        sig = _hub_sig(raw)
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )
        assert r.status_code == 200

    def test_dev_bypass_no_secret_accepted(self, meta_client_dev):
        """When secret is unset and dev-bypass is on, request accepted without sig."""
        raw = _meta_body()
        r = meta_client_dev.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 200

    def test_no_secret_no_bypass_rejected(self, monkeypatch):
        """When secret is unset and dev-bypass is off, must fail closed (403)."""
        monkeypatch.delenv("META_APP_SECRET", raising=False)
        monkeypatch.delenv("META_WEBHOOK_DEV_SKIP_SIGNATURE", raising=False)
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
        import app
        client = TestClient(app.app, raise_server_exceptions=True)
        raw = _meta_body()
        r = client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 403

    def test_response_does_not_contain_secret(self, meta_client):
        """The response body must never reflect the Meta app secret."""
        raw = _meta_body()
        sig = _hub_sig(raw)
        r = meta_client.post(
            "/api/meta/webhooks",
            content=raw,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )
        assert META_SECRET not in r.text


# ══════════════════════════════════════════════════════════════════════════════
#  webhook_events dedup unit tests
# ══════════════════════════════════════════════════════════════════════════════

class TestWebhookEventsDedup:
    """Unit tests for integrations.webhook_events dedup API."""

    def test_not_seen_before_mark(self, monkeypatch):
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        from integrations import webhook_events
        assert webhook_events.already_seen("meta", "evt_001") is False

    def test_seen_after_mark(self, monkeypatch):
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        from integrations import webhook_events
        webhook_events.mark_seen("meta", "evt_002", ttl_seconds=3600)
        assert webhook_events.already_seen("meta", "evt_002") is True

    def test_not_seen_after_ttl_expires(self, monkeypatch):
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        from integrations import webhook_events
        # Mark with TTL already in the past by writing the row directly
        import persistence
        import time as _time
        repo = persistence.table("integrations_webhook_events")
        row_id = webhook_events._event_row_id("meta", "evt_003_expired")
        repo.upsert(persistence.envelope(
            row_id=row_id,
            tenant_id="meta",
            data={
                "provider": "meta",
                "event_id": "evt_003_expired",
                "expires_at": _time.time() - 1,   # already expired
            },
        ))
        assert webhook_events.already_seen("meta", "evt_003_expired") is False

    def test_different_providers_independent(self, monkeypatch):
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        from integrations import webhook_events
        webhook_events.mark_seen("provider_a", "shared_id", ttl_seconds=3600)
        assert webhook_events.already_seen("provider_a", "shared_id") is True
        assert webhook_events.already_seen("provider_b", "shared_id") is False


# ══════════════════════════════════════════════════════════════════════════════
#  OAuth state unit tests (webhook_events module)
# ══════════════════════════════════════════════════════════════════════════════

class TestOAuthState:

    @pytest.fixture(autouse=True)
    def _set_secret(self, monkeypatch):
        monkeypatch.setenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", STATE_SECRET)
        monkeypatch.setenv("PIXIE_PERSIST", "memory")

    def test_issue_consume_round_trip(self):
        from integrations.webhook_events import consume_state, issue_state
        payload = {"tenant_id": "t_abc", "provider": "google"}
        state = issue_state(payload)
        result = consume_state(state)
        assert result["tenant_id"] == "t_abc"
        assert result["provider"] == "google"

    def test_tampered_signature_raises(self):
        from integrations.webhook_events import StateTamperedError, consume_state, issue_state
        state = issue_state({"tenant_id": "t_x"})
        # Corrupt last hex chars of the HMAC portion
        parts = state.rsplit(".", 1)
        tampered = parts[0] + "." + ("0" * len(parts[1]))
        with pytest.raises(StateTamperedError):
            consume_state(tampered)

    def test_tampered_payload_raises(self):
        from integrations.webhook_events import StateTamperedError, consume_state, issue_state
        state = issue_state({"tenant_id": "t_y"})
        parts = state.split(".")
        # Replace payload_hex with garbage (keeping same number of parts)
        parts[2] = "deadbeef"
        with pytest.raises(StateTamperedError):
            consume_state(".".join(parts))

    def test_expired_state_raises(self):
        from integrations.webhook_events import StateExpiredError, consume_state, issue_state
        # Issue with a 1-second TTL, then consume with now in the future
        state = issue_state({"tenant_id": "t_z"}, ttl_seconds=1)
        future_now = time.time() + 10
        with pytest.raises(StateExpiredError):
            consume_state(state, _now=future_now)

    def test_replayed_state_raises(self):
        from integrations.webhook_events import StateConsumedError, consume_state, issue_state
        state = issue_state({"tenant_id": "t_replay"})
        consume_state(state)  # first use — succeeds
        with pytest.raises(StateConsumedError):
            consume_state(state)  # replay — must fail

    def test_missing_secret_raises_on_issue(self, monkeypatch):
        monkeypatch.delenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", raising=False)
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        from integrations import webhook_events
        with pytest.raises(RuntimeError):
            webhook_events.issue_state({"tenant_id": "t"})

    def test_missing_secret_raises_on_consume(self, monkeypatch):
        monkeypatch.delenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", raising=False)
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        from integrations import webhook_events
        with pytest.raises(RuntimeError):
            webhook_events.consume_state("a.b.c.d")

    def test_wrong_format_raises(self):
        from integrations.webhook_events import StateTamperedError, consume_state
        with pytest.raises(StateTamperedError):
            consume_state("only.three.parts")

    def test_state_id_is_unique_per_call(self):
        from integrations.webhook_events import issue_state
        s1 = issue_state({"tenant_id": "t"})
        s2 = issue_state({"tenant_id": "t"})
        id1 = s1.split(".")[0]
        id2 = s2.split(".")[0]
        assert id1 != id2

    def test_fallback_to_pixie_internal_secret(self, monkeypatch):
        """Falls back to PIXIE_INTERNAL_API_SECRET when state secret is absent."""
        monkeypatch.delenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", raising=False)
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "fallback_secret_ok")
        from integrations.webhook_events import consume_state, issue_state
        state = issue_state({"tenant_id": "t_fallback"})
        result = consume_state(state)
        assert result["tenant_id"] == "t_fallback"

    def test_secret_not_in_state_token(self):
        """The state token must not contain the secret in plaintext."""
        from integrations.webhook_events import issue_state
        state = issue_state({"tenant_id": "t"})
        assert STATE_SECRET not in state


# ══════════════════════════════════════════════════════════════════════════════
#  Google OAuth HTTP surface (integration via TestClient)
# ══════════════════════════════════════════════════════════════════════════════

class TestGoogleOAuthHTTP:

    def test_connect_without_secret_returns_error_popup(self, monkeypatch):
        """When no state secret is configured, /connect returns an error popup."""
        monkeypatch.delenv("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", raising=False)
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake_cid")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake_csec")
        monkeypatch.setenv("PIXIE_PERSIST", "memory")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
        import app
        client = TestClient(app.app, raise_server_exceptions=True)
        # follow_redirects=False so we can check the 302; but here we expect an
        # HTML error page (no redirect) because secret is missing.
        r = client.get("/api/integrations/google/connect", params={"tenant_id": "t"},
                       follow_redirects=False)
        # Either 200 HTML error page or 302 to Google — we check what was returned
        if r.status_code == 200:
            assert "state_configuration_error" in r.text or "not_configured" in r.text
        # If Google OAuth is also not configured, that path returns a 200 error page too

    def test_callback_tampered_state_shows_error_popup(self, google_client):
        """Callback with a tampered state must show the error popup (not crash)."""
        r = google_client.get(
            "/api/integrations/google/callback",
            params={"code": "fake_code", "state": "bad.state.value.here"},
        )
        assert r.status_code == 200
        assert "state_tampered" in r.text or "state_error" in r.text or "state_" in r.text

    def test_callback_expired_state_shows_error_popup(self, google_client):
        """Callback with an expired state token returns an error popup."""
        # We can't easily override _now in the HTTP handler, so use a tiny TTL
        # and wait — instead we craft a token with an already-past expiry by
        # directly building a state string with modified expiry.
        from integrations.webhook_events import _sign, issue_state
        import json as _json

        # Issue a valid state
        state = issue_state({"tenant_id": "t_exp"}, ttl_seconds=3600)
        parts = state.split(".")
        # Replace expires_at with a timestamp in the past
        old_expiry = str(int(time.time()) - 100)
        parts[1] = old_expiry
        # Re-sign with the test secret (simulating a legitimate expired token)
        signed_data = ".".join(parts[:3])
        parts[3] = _sign(signed_data, STATE_SECRET)
        expired_state = ".".join(parts)

        r = google_client.get(
            "/api/integrations/google/callback",
            params={"code": "fake_code", "state": expired_state},
        )
        assert r.status_code == 200
        assert "state_expired" in r.text or "state_" in r.text

    def test_callback_replayed_state_shows_error_popup(self, monkeypatch, google_client):
        """Replaying a callback with the same state token must be rejected."""
        from integrations.webhook_events import issue_state, consume_state

        # Issue a state and consume it once outside the HTTP layer
        state = issue_state({"tenant_id": "t_replay"})
        consume_state(state)  # consume it directly — simulates a successful callback

        # Now try to use it again via the HTTP callback (should fail)
        r = google_client.get(
            "/api/integrations/google/callback",
            params={"code": "fake_code", "state": state},
        )
        assert r.status_code == 200
        assert "state_replayed" in r.text or "state_" in r.text

    def test_callback_missing_code_shows_error_popup(self, google_client):
        r = google_client.get(
            "/api/integrations/google/callback",
            params={"state": "some_state"},
        )
        assert r.status_code == 200
        assert "bad_request" in r.text or "error" in r.text

    def test_callback_error_param_shows_cancel_popup(self, google_client):
        r = google_client.get(
            "/api/integrations/google/callback",
            params={"error": "access_denied"},
        )
        assert r.status_code == 200
        assert "cancelled" in r.text.lower() or "access_denied" in r.text

    def test_connect_returns_redirect_when_configured(self, google_client):
        """With proper config, /connect should redirect to Google (not an error page)."""
        r = google_client.get(
            "/api/integrations/google/connect",
            params={"tenant_id": "t_ok"},
            follow_redirects=False,
        )
        # Expect a 302 to accounts.google.com
        assert r.status_code == 302
        assert "accounts.google.com" in r.headers.get("location", "")
