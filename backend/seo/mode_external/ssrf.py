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


def _decode_numeric_ip(host: str):
    """Decode an obfuscated IPv4 literal (octal / hex / decimal-integer /
    short-form) to its canonical dotted-decimal string, or return None when the
    host is not a numeric IP literal.

    Python's ``ipaddress.ip_address`` only accepts strict dotted-decimal, so
    forms a C ``inet_aton``-based fetcher WOULD honor — ``2130706433``,
    ``0177.0.0.1`` (octal), ``0x7f.0x0.0x0.0x1`` (hex), ``127.1`` (short) —
    otherwise slip past the IP-literal check and reach an internal address.
    We decode them here using the same inet_aton collapse rules so they can be
    run through ``_ip_is_blocked``.
    """
    if not host:
        return None
    # Reject anything containing characters that cannot appear in a numeric
    # IPv4 literal so real hostnames (which always contain a non-[0-9a-fx.]
    # char somewhere, e.g. a letter other than a-f or a hyphen) fall through.
    allowed = set("0123456789abcdefx.")
    if any(ch not in allowed for ch in host):
        return None
    parts = host.split(".")
    if not parts or len(parts) > 4:
        return None
    nums = []
    for p in parts:
        if not p:
            return None
        try:
            if p.startswith("0x"):
                value = int(p, 16)
            elif p.startswith("0") and len(p) > 1:
                value = int(p, 8)
            else:
                value = int(p, 10)
        except ValueError:
            return None
        nums.append(value)
    # inet_aton collapse: the final part absorbs the remaining low-order bytes.
    if len(nums) == 1:
        packed = nums[0]
    elif len(nums) == 2:
        packed = (nums[0] << 24) | nums[1]
    elif len(nums) == 3:
        packed = (nums[0] << 24) | (nums[1] << 16) | nums[2]
    else:
        packed = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]
    if packed < 0 or packed > 0xFFFFFFFF:
        return None
    try:
        return str(ipaddress.IPv4Address(packed))
    except (ipaddress.AddressValueError, ValueError):
        return None


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

    # Not a strict dotted-decimal/IPv6 literal: it may still be an obfuscated
    # numeric IPv4 (octal / hex / decimal-integer / short form) that a libc
    # resolver would honor. Decode and re-check fail-closed.
    if not is_ip:
        decoded = _decode_numeric_ip(host)
        if decoded is not None and _ip_is_blocked(decoded):
            return False, "blocked obfuscated ip address: {} -> {}".format(host, decoded)

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

    # Obfuscated numeric IPv4 literal (octal/hex/decimal-int/short form). Decode
    # and check directly — getaddrinfo mis-parses some of these (e.g. it reads
    # "0177" as decimal 177, not octal 127), so do not trust it for these.
    decoded = _decode_numeric_ip(host)
    if decoded is not None:
        if _ip_is_blocked(decoded):
            return False, "blocked obfuscated ip address: {} -> {}".format(host, decoded)
        return True, "ok"

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
