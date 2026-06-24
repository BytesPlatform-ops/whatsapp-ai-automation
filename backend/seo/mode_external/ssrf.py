from __future__ import annotations

import ipaddress
import socket
from typing import Tuple
from urllib.parse import urlsplit

# Only these schemes may ever be fetched. Everything else (file, ftp,
# gopher, data, javascript, ...) is rejected up front.
_ALLOWED_SCHEMES = frozenset({"http", "https"})

# Hostnames that always resolve to the local machine / internal infra and
# must never be fetched, regardless of DNS.
_BLOCKED_EXACT_NAMES = frozenset({"localhost"})

# Any host ending in one of these suffixes is treated as internal.
_BLOCKED_SUFFIXES = (".local", ".internal", ".localhost")


def _ip_is_blocked(ip_str) -> bool:
    """Return True when ip_str is an address we refuse to fetch.

    Blocks loopback, private (RFC1918 / fc00::/7), link-local (incl. the
    169.254.169.254 cloud-metadata IP and fe80::/10), unspecified,
    reserved and multicast addresses. Anything that fails to parse as an IP
    is treated as blocked (fail closed).
    """
    try:
        ip = ipaddress.ip_address(str(ip_str).strip())
    except ValueError:
        return True

    # Unwrap IPv4-mapped / 6to4 / teredo IPv6 addresses to their embedded
    # IPv4 so a private v4 cannot sneak through as a "global" v6.
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    sixtofour = getattr(ip, "sixtofour", None)
    if sixtofour is not None:
        ip = sixtofour

    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_unspecified
        or ip.is_reserved
        or ip.is_multicast
    ):
        return True

    # Explicit belt-and-suspenders for the cloud metadata endpoint.
    if str(ip) == "169.254.169.254":
        return True

    return False


def _strip_host(host: str) -> str:
    """Normalize a URL host: strip brackets from IPv6 literals and any
    trailing dot, lowercase it."""
    if not host:
        return ""
    host = host.strip().strip(".").lower()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1]
    return host


def is_safe_url(url: str) -> Tuple[bool, str]:
    """Return (ok, reason). ok=False means the URL must NOT be fetched.

    This does NOT perform DNS resolution; it only inspects the URL string.
    Use resolve_and_check() for hostname-based SSRF defense.
    """
    if not isinstance(url, str) or not url.strip():
        return False, "empty url"

    parts = urlsplit(url.strip())

    scheme = (parts.scheme or "").lower()
    if scheme not in _ALLOWED_SCHEMES:
        return False, "scheme not allowed: {}".format(scheme or "<none>")

    host = _strip_host(parts.hostname or "")
    if not host:
        return False, "empty host"

    if host in _BLOCKED_EXACT_NAMES:
        return False, "blocked host name: {}".format(host)

    for suffix in _BLOCKED_SUFFIXES:
        if host.endswith(suffix):
            return False, "blocked host suffix: {}".format(suffix)

    # If the host is an IP literal, validate it directly.
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False

    if is_ip and _ip_is_blocked(host):
        return False, "blocked ip address: {}".format(host)

    return True, "ok"


def resolve_and_check(host: str) -> Tuple[bool, str]:
    """Resolve host via DNS and run every resolved IP through _ip_is_blocked.

    Defends against hostnames that resolve to internal IPs (DNS rebinding /
    pointing a public name at 127.0.0.1). This performs real network I/O and
    is intentionally OPTIONAL — callers may skip it in offline/test paths.
    Returns (ok, reason); ok=False if ANY resolved address is blocked or
    resolution fails.
    """
    host = _strip_host(host or "")
    if not host:
        return False, "empty host"

    # Already an IP literal — no DNS needed.
    try:
        ipaddress.ip_address(host)
        if _ip_is_blocked(host):
            return False, "blocked ip address: {}".format(host)
        return True, "ok"
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        return False, "dns resolution failed: {}".format(exc)
    except OSError as exc:
        return False, "dns resolution error: {}".format(exc)

    if not infos:
        return False, "no addresses resolved"

    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0]
        if _ip_is_blocked(ip_str):
            return False, "host resolves to blocked ip: {}".format(ip_str)

    return True, "ok"
