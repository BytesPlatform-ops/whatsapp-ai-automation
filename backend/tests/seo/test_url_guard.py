"""Tests for seo.url_guard — the shared SSRF-safe fetch service.

All tests are offline (no real network, no sockets opened).  httpx is
mocked at the transport boundary via ``httpx.MockTransport`` so the
actual HTTP stack is exercised but no TCP connections are made.  DNS
resolution (``socket.getaddrinfo`` inside ``seo.mode_external.ssrf``)
is monkeypatched for tests that need to simulate DNS rebinding.

Test coverage
-------------
* localhost rejected
* private IPv4 (10.x / 192.168.x / 127.0.0.1) rejected
* private IPv6 (::1, fc00::/7, fe80::) rejected
* redirect-to-internal rejected (mock 302 → internal Location)
* DNS-rebinding simulation rejected (public hostname resolves to private IP)
* oversized response rejected (Content-Length header + streamed bytes)
* excess redirects rejected
* non-HTML content-type rejected when require_html=True
* bad scheme rejected
* embedded credentials rejected
* non-standard port rejected
* happy-path: public URL returns expected dict shape
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import httpx

from seo.url_guard import (
    REASON_BAD_SCHEME,
    REASON_BLOCKED_PORT,
    REASON_BLOCKED_PRIVATE_IP,
    REASON_EMBEDDED_CREDENTIALS,
    REASON_RESPONSE_TOO_LARGE,
    REASON_TOO_MANY_REDIRECTS,
    REASON_UNSUPPORTED_CONTENT_TYPE,
    UrlRejected,
    assert_safe_url,
    safe_fetch,
)

# ---------------------------------------------------------------------------
# Constants for test bodies
# ---------------------------------------------------------------------------

_HTML_BODY = b"<html><head><title>Hi</title></head><body>Hello</body></html>"
_HTML_CT = "text/html; charset=utf-8"

# Capture the real httpx.Client before any monkeypatching so helpers that
# need to create a real Client (backed by a mock transport) can do so even
# while seo.url_guard.httpx.Client is patched.
_RealHttpxClient = httpx.Client


# ---------------------------------------------------------------------------
# Transport helpers
# ---------------------------------------------------------------------------

def _make_replay_transport(responses: list[httpx.Response]) -> httpx.MockTransport:
    """Return a MockTransport that replays *responses* in order."""
    remaining = list(responses)

    def _handler(request: httpx.Request) -> httpx.Response:
        if not remaining:
            raise AssertionError(
                "transport: no more canned responses "
                "(unexpected request to {})".format(request.url)
            )
        resp = remaining.pop(0)
        resp.request = request
        return resp

    return httpx.MockTransport(_handler)


def _patch_safe_fetch_client(monkeypatch, responses: list[httpx.Response]):
    """Monkeypatch ``seo.url_guard.httpx.Client`` so ``safe_fetch`` uses a
    real httpx.Client backed by our mock transport.

    ``safe_fetch`` does ``with httpx.Client(...) as client: client.get(...)``,
    so the patched constructor must return an object that:
      - is a context manager (via ``__enter__``/``__exit__``)
      - exposes ``.get()``

    A real ``httpx.Client`` with a ``MockTransport`` satisfies both.

    We capture ``_RealHttpxClient`` at module-load time (before any patch) to
    avoid the recursion that would arise if the factory called ``httpx.Client``
    while it is itself patched.
    """
    transport = _make_replay_transport(responses)

    def _fake_constructor(**kwargs):
        return _RealHttpxClient(transport=transport, follow_redirects=False, timeout=10.0)

    monkeypatch.setattr("seo.url_guard.httpx.Client", _fake_constructor)


# ---------------------------------------------------------------------------
# assert_safe_url — pure-validation tests (no network required)
# ---------------------------------------------------------------------------

class TestAssertSafeUrl:
    def test_localhost_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://localhost/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_loopback_127_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://127.0.0.1/secret")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv4_10_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://10.0.0.5/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv4_192_168_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://192.168.1.100/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv4_172_16_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://172.16.0.1/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_metadata_ip_169_254_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://169.254.169.254/latest/meta-data/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv6_loopback_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://[::1]/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv6_fc00_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://[fc00::1]/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_private_ipv6_fe80_link_local_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://[fe80::1]/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_bad_scheme_ftp_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("ftp://example.com/")
        assert exc_info.value.reason == REASON_BAD_SCHEME

    def test_bad_scheme_file_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("file:///etc/passwd")
        assert exc_info.value.reason == REASON_BAD_SCHEME

    def test_bad_scheme_javascript_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("javascript:alert(1)")
        assert exc_info.value.reason == REASON_BAD_SCHEME

    def test_embedded_credentials_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://user:pass@example.com/")
        assert exc_info.value.reason == REASON_EMBEDDED_CREDENTIALS

    def test_embedded_username_only_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://user@example.com/")
        assert exc_info.value.reason == REASON_EMBEDDED_CREDENTIALS

    def test_non_standard_port_8080_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://example.com:8080/")
        assert exc_info.value.reason == REASON_BLOCKED_PORT

    def test_port_9000_rejected(self):
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://example.com:9000/")
        assert exc_info.value.reason == REASON_BLOCKED_PORT

    def test_port_80_allowed(self):
        # Port 80 is in the whitelist and 93.184.216.34 is a public IP, so
        # no real DNS is needed and this should pass without raising.
        assert_safe_url("http://93.184.216.34:80/")

    def test_port_443_allowed(self):
        assert_safe_url("https://93.184.216.34:443/")

    def test_default_port_allowed(self):
        # No explicit port → scheme default → always allowed.
        assert_safe_url("https://93.184.216.34/")

    def test_reason_never_leaks_ip_detail(self):
        """The reason must be a plain category string — no IP addresses."""
        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("http://10.0.0.1/")
        assert "10.0.0" not in exc_info.value.reason
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP


# ---------------------------------------------------------------------------
# DNS-rebinding simulation
# (monkeypatch socket.getaddrinfo inside seo.mode_external.ssrf)
# ---------------------------------------------------------------------------

class TestDnsRebinding:
    def test_public_hostname_resolving_to_private_ipv4_rejected(self, monkeypatch):
        """A hostname that looks public but resolves to a private IPv4 must be
        rejected.  We monkeypatch ``socket.getaddrinfo`` in the ssrf module's
        namespace to return a private address without network I/O."""
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("10.0.0.1", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("https://evil.example.com/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP
        # Reason must not leak the resolved IP.
        assert "10.0.0" not in exc_info.value.reason

    def test_public_hostname_resolving_to_loopback_rejected(self, monkeypatch):
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("127.0.0.1", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("https://notevil.example.com/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_public_hostname_resolving_to_ipv6_loopback_rejected(self, monkeypatch):
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("::1", 0, 0, 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        with pytest.raises(UrlRejected) as exc_info:
            assert_safe_url("https://ipv6only.example.com/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_public_hostname_resolving_to_public_ip_allowed(self, monkeypatch):
        """A hostname resolving to a genuinely public IP must pass."""
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("93.184.216.34", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        # Should not raise.
        assert_safe_url("https://example.com/")


# ---------------------------------------------------------------------------
# safe_fetch — tests using MockTransport (no real network)
# ---------------------------------------------------------------------------

class TestSafeFetch:
    """Tests for safe_fetch using httpx.MockTransport injected via monkeypatch."""

    # ------------------------------------------------------------------
    # Happy path
    # ------------------------------------------------------------------

    def test_happy_path_returns_correct_shape(self, monkeypatch):
        # Use a dotted-decimal public IP to skip real DNS.
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=_HTML_BODY,
                           headers={"content-type": _HTML_CT}),
        ])

        result = safe_fetch("http://93.184.216.34/", require_html=True)
        assert result["status"] == 200
        assert "Hello" in result["text"]
        assert result["content_type"].startswith("text/html")
        assert "final_url" in result
        assert isinstance(result["headers"], dict)

    def test_happy_path_headers_subset_returned(self, monkeypatch):
        """Only safe headers are returned — no Set-Cookie or internal headers."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=_HTML_BODY, headers={
                "content-type": _HTML_CT,
                "server": "nginx",
                "set-cookie": "session=secret; HttpOnly",
                "x-internal-token": "very-secret",
            }),
        ])

        result = safe_fetch("http://93.184.216.34/")
        assert "set-cookie" not in result["headers"]
        assert "x-internal-token" not in result["headers"]
        assert result["headers"].get("server") == "nginx"

    # ------------------------------------------------------------------
    # Redirect handling
    # ------------------------------------------------------------------

    def test_redirect_to_public_url_followed(self, monkeypatch):
        """A redirect to another safe public URL should be followed."""
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("93.184.216.34", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(302, headers={"location": "http://example.com/final"}),
            httpx.Response(200, content=_HTML_BODY,
                           headers={"content-type": _HTML_CT}),
        ])

        result = safe_fetch("http://example.com/")
        assert result["status"] == 200

    def test_redirect_to_localhost_rejected(self, monkeypatch):
        """A 302 → localhost must be caught and rejected."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(302, headers={"location": "http://localhost/evil"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_redirect_to_private_ipv4_rejected(self, monkeypatch):
        """A 302 → 192.168.x must be rejected."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(302, headers={"location": "http://192.168.1.1/admin"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_redirect_to_internal_via_dns_rebinding_rejected(self, monkeypatch):
        """Redirect to a public-looking hostname that DNS resolves to a private
        IP must be caught (DNS-rebinding via redirect chain)."""
        import seo.mode_external.ssrf as ssrf_mod

        def _fake_getaddrinfo(host, port, *args, **kwargs):
            if "evil" in host:
                return [(None, None, None, None, ("10.0.0.1", 0))]
            return [(None, None, None, None, ("93.184.216.34", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _fake_getaddrinfo)

        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(302, headers={"location": "https://evil-rebind.example.com/steal"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://safe.example.com/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_too_many_redirects_rejected(self, monkeypatch):
        """Exceeding max_redirects raises UrlRejected(REASON_TOO_MANY_REDIRECTS)."""
        # max_redirects=2: the third hop should exceed the cap.
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(302, headers={"location": "http://93.184.216.34/hop1"}),
            httpx.Response(302, headers={"location": "http://93.184.216.34/hop2"}),
            # Provide a third response so the transport doesn't complain if
            # safe_fetch checks it — but the code should raise before using it.
            httpx.Response(302, headers={"location": "http://93.184.216.34/hop3"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/", max_redirects=2)
        assert exc_info.value.reason == REASON_TOO_MANY_REDIRECTS

    # ------------------------------------------------------------------
    # Size limits
    # ------------------------------------------------------------------

    def test_content_length_header_too_large_rejected(self, monkeypatch):
        """A Content-Length header exceeding max_bytes is rejected before streaming."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=b"tiny", headers={
                "content-type": _HTML_CT,
                "content-length": str(3_000_000),  # 3 MB > 2 MB default cap
            }),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/", max_bytes=2_000_000)
        assert exc_info.value.reason == REASON_RESPONSE_TOO_LARGE

    def test_streamed_bytes_too_large_rejected(self, monkeypatch):
        """Body that exceeds max_bytes during streaming is rejected even without
        a Content-Length header (lying/omitting server)."""
        big_body = b"A" * 100  # 100 bytes
        _patch_safe_fetch_client(monkeypatch, [
            # Deliberately omit content-length so the early-exit doesn't fire.
            httpx.Response(200, content=big_body,
                           headers={"content-type": _HTML_CT}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/", max_bytes=50)  # cap at 50 bytes
        assert exc_info.value.reason == REASON_RESPONSE_TOO_LARGE

    # ------------------------------------------------------------------
    # Content-type enforcement
    # ------------------------------------------------------------------

    def test_non_html_content_type_rejected_when_require_html(self, monkeypatch):
        """application/json response is rejected when require_html=True."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=b'{"ok": true}',
                           headers={"content-type": "application/json"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/api", require_html=True)
        assert exc_info.value.reason == REASON_UNSUPPORTED_CONTENT_TYPE

    def test_pdf_content_type_rejected_when_require_html(self, monkeypatch):
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=b"%PDF-1.4",
                           headers={"content-type": "application/pdf"}),
        ])

        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://93.184.216.34/doc.pdf", require_html=True)
        assert exc_info.value.reason == REASON_UNSUPPORTED_CONTENT_TYPE

    def test_xhtml_content_type_accepted_when_require_html(self, monkeypatch):
        """application/xhtml+xml is a valid HTML content type."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=b"<html/>",
                           headers={"content-type": "application/xhtml+xml; charset=utf-8"}),
        ])

        result = safe_fetch("http://93.184.216.34/", require_html=True)
        assert result["status"] == 200

    def test_non_html_allowed_when_not_require_html(self, monkeypatch):
        """Without require_html, any content type is accepted."""
        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=b'{"ok": true}',
                           headers={"content-type": "application/json"}),
        ])

        result = safe_fetch("http://93.184.216.34/api", require_html=False)
        assert result["status"] == 200

    # ------------------------------------------------------------------
    # URL-level rejections (assert_safe_url fires before any HTTP)
    # ------------------------------------------------------------------

    def test_localhost_rejected_before_http_client_created(self):
        """safe_fetch must reject localhost without creating an httpx Client.
        assert_safe_url fires before the ``with httpx.Client(...)`` block."""
        with pytest.raises(UrlRejected) as exc_info:
            # No monkeypatch needed — assert_safe_url rejects synchronously.
            safe_fetch("http://localhost/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_bad_scheme_rejected_before_http(self):
        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("ftp://example.com/")
        assert exc_info.value.reason == REASON_BAD_SCHEME

    def test_private_ip_rejected_before_http(self):
        with pytest.raises(UrlRejected) as exc_info:
            safe_fetch("http://10.42.0.1/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP


# ---------------------------------------------------------------------------
# fetch_full backward-compatibility (httpx_fetch.py wrapper)
# ---------------------------------------------------------------------------

class TestFetchFull:
    """fetch_full must return the same dict shape as before and raise
    UrlRejected (not swallow it) for unsafe URLs."""

    def test_fetch_full_returns_expected_keys(self, monkeypatch):
        import seo.mode_external.ssrf as ssrf_mod

        def _ok_getaddrinfo(host, port, *args, **kwargs):
            return [(None, None, None, None, ("93.184.216.34", 0))]

        monkeypatch.setattr(ssrf_mod.socket, "getaddrinfo", _ok_getaddrinfo)

        _patch_safe_fetch_client(monkeypatch, [
            httpx.Response(200, content=_HTML_BODY,
                           headers={"content-type": _HTML_CT}),
        ])

        from seo.httpx_fetch import fetch_full
        result = fetch_full("http://example.com/")
        assert set(result.keys()) == {"html", "headers", "final_url", "status"}
        assert isinstance(result["html"], str)
        assert isinstance(result["status"], int)
        assert isinstance(result["headers"], dict)
        assert isinstance(result["final_url"], str)

    def test_fetch_full_raises_url_rejected_for_private_ip(self):
        from seo.httpx_fetch import fetch_full
        with pytest.raises(UrlRejected) as exc_info:
            fetch_full("http://10.0.0.1/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP

    def test_fetch_full_raises_url_rejected_for_localhost(self):
        from seo.httpx_fetch import fetch_full
        with pytest.raises(UrlRejected) as exc_info:
            fetch_full("http://localhost/")
        assert exc_info.value.reason == REASON_BLOCKED_PRIVATE_IP
