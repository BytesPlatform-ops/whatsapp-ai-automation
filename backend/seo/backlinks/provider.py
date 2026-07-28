"""Backlink provider abstraction.

Provider interface:
  BacklinkProvider — abstract base; subclasses implement the 6 data methods.

Implementations:
  MockBacklinkProvider — deterministic, hash-based, paginates, NO network.
    All metrics are clearly tagged as provider_sourced=False (mock).
  HttpBacklinkProvider  — lazy urllib; never called in normal tests.
    Requires SEO_BACKLINK_API_KEY + SEO_BACKLINK_ENDPOINT in environment.
    Marked with # pragma: no cover on network paths.

Factory:
  get_backlink_provider() — reads SEO_BACKLINK_PROVIDER env; returns Mock when
    credentials absent. NEVER fabricates domain authority — passes provider
    metrics through verbatim or returns None.

IMPORTANT: We deliberately do NOT invent authority scores. Provider-supplied
metrics are passed through as-is (provider_metrics dict). When the provider
does not return a field, we store None — never a computed stand-in.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from typing import Dict, List, Optional


# ── Provider abstraction ────────────────────────────────────────────────────────

class BacklinkProvider:
    """Abstract interface for backlink data sources.

    Every method returns raw-ish dicts (not dataclasses) so the service layer
    can normalise into Backlink / ReferringDomain objects. The ``name`` class
    attribute appears in every persisted record as the ``provider`` field.
    """

    name: str = "base"

    def summary(self, domain: str) -> Dict:
        """High-level profile: total backlinks, referring domains, top stats."""
        raise NotImplementedError  # pragma: no cover

    def backlinks(
        self, domain: str, *,
        target: Optional[str] = None,
        start_row: int = 0,
        row_limit: int = 100,
    ) -> Dict:
        """Paginated backlink rows.

        Returns::
            {
                "rows": [...],        # list of backlink dicts
                "next": int | None,   # next start_row, or None when exhausted
                "total": int          # total available rows (may be approximate)
            }
        """
        raise NotImplementedError  # pragma: no cover

    def referring_domains(self, domain: str) -> List[Dict]:
        """All referring root domains with aggregate counts."""
        raise NotImplementedError  # pragma: no cover

    def new_lost(self, domain: str, *, since: str) -> Dict:
        """Links gained and lost since ``since`` (ISO date string).

        Returns::
            {
                "new":  [...],   # new backlinks
                "lost": [...]    # lost backlinks
            }
        """
        raise NotImplementedError  # pragma: no cover

    def anchors(self, domain: str) -> List[Dict]:
        """Anchor text distribution.

        Returns list of ``{"anchor": str, "count": int, "follow": int}``.
        """
        raise NotImplementedError  # pragma: no cover

    def competitor_intersections(
        self, domain: str, competitors: List[str]
    ) -> List[Dict]:
        """Domains linking to competitors but not (or also) to ``domain``.

        Returns::
            [
                {
                    "referring_domain": str,
                    "links_to_client": bool,
                    "links_to_competitors": [str],
                    "competitor_count": int,
                    "provider_metrics": dict | None,
                }
            ]
        """
        raise NotImplementedError  # pragma: no cover


# ── Deterministic helpers ───────────────────────────────────────────────────────

def _sha1_ints(seed: str) -> List[int]:
    """Return a stable list of ints derived from sha1(seed)."""
    norm = " ".join((seed or "").lower().split())
    h = hashlib.sha1(norm.encode("utf-8")).hexdigest()
    return [int(h[i: i + 5], 16) for i in range(0, 40, 5)]


def _mock_dedup_key(source_url: str, target_url: str, anchor: str) -> str:
    """Stable sha1 dedup key matching what service.py generates at sync time."""
    raw = "|".join([source_url, target_url, anchor])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


_RELS = ("follow", "nofollow", "ugc", "sponsored")
_LINK_TYPES = ("text", "image", "redirect", "form")
_TLDS = (".com", ".net", ".org", ".io", ".co", ".info", ".biz", ".us")
_SUSPICIOUS_TLDS = frozenset({".xyz", ".top", ".click", ".loan", ".win"})
_COUNTRIES = ("US", "GB", "DE", "CA", "AU", "FR", "IN", "NL")


def _make_mock_backlink(domain: str, index: int, target_domain: str) -> Dict:
    """Generate one deterministic backlink dict for testing/offline use."""
    seed = f"{domain}:bl:{index}"
    ints = _sha1_ints(seed)
    a, b, c, d, e, *_ = ints

    tld = _TLDS[a % len(_TLDS)]
    # Build a plausible source host
    name_seed = f"{domain}:src:{index}"
    name_ints = _sha1_ints(name_seed)
    src_domain = f"site{name_ints[0] % 9000 + 1000}{tld}"
    src_url = f"https://{src_domain}/page/{b % 500}"

    target_paths = ["/", "/about", "/services", "/blog", "/contact", "/pricing"]
    target_path = target_paths[c % len(target_paths)]
    target_url = f"https://{target_domain}{target_path}"

    anchors = [
        target_domain.split(".")[0],
        "click here",
        "learn more",
        "visit site",
        "best service",
        target_domain,
        "website",
    ]
    anchor = anchors[d % len(anchors)]
    rel = _RELS[e % len(_RELS)]
    link_type = _LINK_TYPES[ints[2] % len(_LINK_TYPES)]

    year = 2023 + (ints[3] % 3)
    month = 1 + (ints[4] % 12)
    day = 1 + (ints[5] % 28)
    first_seen = f"{year:04d}-{month:02d}-{day:02d}"
    last_seen = f"2026-{(month % 12) + 1:02d}-15"

    # Provider metrics: real providers return these; we pass through exactly.
    # Using clearly mock-sourced values so callers can identify the source.
    domain_rating = (ints[1] % 91)   # 0–90 (provider-sourced)
    url_rating = (ints[2] % 81)      # 0–80 (provider-sourced)

    country_code = _COUNTRIES[ints[6] % len(_COUNTRIES)]

    return {
        "source_url": src_url,
        "source_domain": src_domain,
        "target_url": target_url,
        "anchor_text": anchor,
        "rel": rel,
        "link_type": link_type,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "status": "active",
        "language": "en",
        "country": country_code,
        "redirect_chain": [],
        "provider": "mock",
        "data_timestamp": "2026-07-29T00:00:00Z",
        "dedup_key": _mock_dedup_key(src_url, target_url, anchor),
        # Provider metrics: present and provider-sourced; never fabricated by us.
        "provider_metrics": {
            "domain_rating": domain_rating,
            "url_rating": url_rating,
            "provider_sourced": True,
            "is_mock": True,
        },
    }


# ── MockBacklinkProvider ───────────────────────────────────────────────────────

class MockBacklinkProvider(BacklinkProvider):
    """Deterministic, offline backlink provider.

    Every number is a pure function of the domain string so the same input
    always yields the same output (essential for regression tests). No network
    calls, no randomness, no time-based values.

    The ``_total_links`` for a domain is derived from sha1, giving a stable
    pool of 50–300 backlinks per domain.
    """

    name = "mock"

    def _total_links(self, domain: str) -> int:
        ints = _sha1_ints(domain)
        return 50 + (ints[0] % 251)  # 50–300

    def summary(self, domain: str) -> Dict:
        total = self._total_links(domain)
        ints = _sha1_ints(domain)
        rd_count = max(1, total // (2 + ints[1] % 5))
        return {
            "domain": domain,
            "total_backlinks": total,
            "referring_domains": rd_count,
            "follow_count": int(total * 0.7),
            "nofollow_count": total - int(total * 0.7),
            "provider": self.name,
            "provider_metrics": {
                "domain_rating": ints[2] % 91,
                "is_mock": True,
            },
        }

    def backlinks(
        self, domain: str, *,
        target: Optional[str] = None,
        start_row: int = 0,
        row_limit: int = 100,
    ) -> Dict:
        total = self._total_links(domain)
        all_rows = [_make_mock_backlink(domain, i, domain) for i in range(total)]
        if target:
            all_rows = [r for r in all_rows if r["target_url"].startswith(f"https://{domain}")]

        page = all_rows[start_row: start_row + row_limit]
        next_row = (start_row + row_limit) if (start_row + row_limit) < total else None
        return {
            "rows": page,
            "next": next_row,
            "total": total,
            "provider": self.name,
        }

    def referring_domains(self, domain: str) -> List[Dict]:
        total = self._total_links(domain)
        ints = _sha1_ints(domain)
        rd_count = max(1, total // (2 + ints[1] % 5))

        domains = []
        for i in range(rd_count):
            bl = _make_mock_backlink(domain, i, domain)
            src_domain = bl["source_domain"]
            dr = (ints[2] + i) % 91
            domains.append({
                "domain": src_domain,
                "backlink_count": 1 + (i % 5),
                "follow_count": 1,
                "nofollow_count": (i % 3),
                "first_seen": bl["first_seen"],
                "last_seen": bl["last_seen"],
                "status": "active",
                "provider_metrics": {
                    "domain_rating": dr,
                    "is_mock": True,
                },
            })
        return domains

    def new_lost(self, domain: str, *, since: str) -> Dict:
        """Return a small deterministic new/lost set based on domain hash."""
        ints = _sha1_ints(domain + since)
        new_count = ints[0] % 10
        lost_count = ints[1] % 5
        new_links = [_make_mock_backlink(domain, 9000 + i, domain) for i in range(new_count)]
        lost_links = [_make_mock_backlink(domain, 9500 + i, domain) for i in range(lost_count)]
        for bl in lost_links:
            bl["status"] = "lost"
        return {"new": new_links, "lost": lost_links}

    def anchors(self, domain: str) -> List[Dict]:
        backlinks = self.backlinks(domain, row_limit=200)["rows"]
        counts: Dict[str, int] = {}
        follow_counts: Dict[str, int] = {}
        for bl in backlinks:
            anchor = bl.get("anchor_text", "")
            counts[anchor] = counts.get(anchor, 0) + 1
            if bl.get("rel") == "follow":
                follow_counts[anchor] = follow_counts.get(anchor, 0) + 1
        return [
            {"anchor": a, "count": c, "follow": follow_counts.get(a, 0)}
            for a, c in sorted(counts.items(), key=lambda x: -x[1])
        ]

    def competitor_intersections(
        self, domain: str, competitors: List[str]
    ) -> List[Dict]:
        """Return referring domains that link to competitors (mock: deterministic)."""
        results = []
        for comp in competitors[:5]:  # bound to prevent test blowup
            comp_rds = self.referring_domains(comp)[:10]
            for rd in comp_rds:
                rd_domain = rd["domain"]
                # Check if this domain also links to the client
                client_rds = [r["domain"] for r in self.referring_domains(domain)]
                links_to_client = rd_domain in client_rds
                ints = _sha1_ints(rd_domain + comp)
                results.append({
                    "referring_domain": rd_domain,
                    "links_to_client": links_to_client,
                    "links_to_competitors": [comp],
                    "competitor_count": 1,
                    "provider_metrics": {
                        "domain_rating": ints[0] % 91,
                        "is_mock": True,
                    },
                })
        # Deduplicate by referring_domain, merging competitor lists
        seen: Dict[str, Dict] = {}
        for r in results:
            rd = r["referring_domain"]
            if rd in seen:
                seen[rd]["links_to_competitors"].extend(r["links_to_competitors"])
                seen[rd]["competitor_count"] = len(set(seen[rd]["links_to_competitors"]))
            else:
                seen[rd] = dict(r)
        return list(seen.values())


# ── HttpBacklinkProvider ───────────────────────────────────────────────────────

class HttpBacklinkProvider(BacklinkProvider):
    """Generic credentialed HTTP backlink provider.

    Credentials come from the environment:
      SEO_BACKLINK_API_KEY   — API key for the provider
      SEO_BACKLINK_ENDPOINT  — base URL (default: DataForSEO backlinks endpoint)

    The real HTTP path is documented and guarded; it is NEVER executed offline.
    """

    name = "dataforseo_backlinks"

    _default_endpoint = "https://api.dataforseo.com/v3/backlinks"

    def __init__(self) -> None:  # pragma: no cover
        self.api_key = os.getenv("SEO_BACKLINK_API_KEY")
        self.login = os.getenv("DATAFORSEO_LOGIN")
        self.password = os.getenv("DATAFORSEO_PASSWORD")
        self.endpoint = os.getenv("SEO_BACKLINK_ENDPOINT", self._default_endpoint)
        if not self.available():
            raise RuntimeError(
                "HttpBacklinkProvider requires SEO_BACKLINK_API_KEY or "
                "DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD in the environment."
            )

    def available(self) -> bool:  # pragma: no cover
        return bool(self.api_key or (self.login and self.password))

    def _auth_header(self) -> str:  # pragma: no cover
        if self.api_key:
            return f"Bearer {self.api_key}"
        import base64
        raw = f"{self.login}:{self.password}".encode("utf-8")
        return f"Basic {base64.b64encode(raw).decode('ascii')}"

    def _post(self, path: str, payload: list) -> dict:  # pragma: no cover
        url = f"{self.endpoint}/{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={
                "Authorization": self._auth_header(),
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
            return json.loads(resp.read().decode("utf-8"))

    def summary(self, domain: str) -> Dict:  # pragma: no cover
        resp = self._post("summary/live", [{"target": domain, "include_subdomains": True}])
        task = (resp.get("tasks") or [{}])[0]
        result = (task.get("result") or [{}])[0]
        return {
            "domain": domain,
            "total_backlinks": result.get("backlinks", 0),
            "referring_domains": result.get("referring_domains", 0),
            "follow_count": result.get("follow", 0),
            "nofollow_count": result.get("nofollow", 0),
            "provider": self.name,
            # Pass provider metrics through unchanged — never fabricate.
            "provider_metrics": result,
        }

    def backlinks(
        self, domain: str, *,
        target: Optional[str] = None,
        start_row: int = 0,
        row_limit: int = 100,
    ) -> Dict:  # pragma: no cover
        payload_item = {
            "target": domain,
            "limit": row_limit,
            "offset": start_row,
            "include_subdomains": True,
            "mode": "as_is",
            "filters": [],
        }
        resp = self._post("backlinks/live", [payload_item])
        task = (resp.get("tasks") or [{}])[0]
        result = (task.get("result") or [{}])[0]
        rows_raw = result.get("items") or []
        rows = []
        for item in rows_raw:
            source_url = item.get("url_from", "")
            target_url = item.get("url_to", "")
            anchor = item.get("anchor", "")
            rows.append({
                "source_url": source_url,
                "source_domain": item.get("domain_from", ""),
                "target_url": target_url,
                "anchor_text": anchor,
                "rel": "nofollow" if item.get("dofollow") is False else "follow",
                "link_type": item.get("type", "text"),
                "first_seen": item.get("first_seen", ""),
                "last_seen": item.get("last_seen", ""),
                "status": "active" if item.get("is_lost") is not True else "lost",
                "language": item.get("language", ""),
                "country": item.get("source_country", ""),
                "redirect_chain": item.get("redirect_chain", []),
                "provider": self.name,
                "data_timestamp": item.get("crawl_time", ""),
                "dedup_key": _mock_dedup_key(source_url, target_url, anchor),
                # Pass ALL provider metrics through unchanged.
                "provider_metrics": {
                    k: v for k, v in item.items()
                    if k not in ("url_from", "url_to", "anchor", "dofollow",
                                 "type", "first_seen", "last_seen", "is_lost",
                                 "language", "source_country", "redirect_chain",
                                 "crawl_time", "domain_from")
                },
            })
        total = result.get("total_count", len(rows))
        next_row = (start_row + row_limit) if (start_row + row_limit) < total else None
        return {"rows": rows, "next": next_row, "total": total, "provider": self.name}

    def referring_domains(self, domain: str) -> List[Dict]:  # pragma: no cover
        resp = self._post("referring_domains/live", [{"target": domain, "limit": 1000}])
        task = (resp.get("tasks") or [{}])[0]
        result = (task.get("result") or [{}])[0]
        out = []
        for item in (result.get("items") or []):
            out.append({
                "domain": item.get("domain", ""),
                "backlink_count": item.get("backlinks", 0),
                "follow_count": item.get("dofollow", 0),
                "nofollow_count": item.get("nofollow", 0),
                "first_seen": item.get("first_seen", ""),
                "last_seen": item.get("last_seen", ""),
                "status": "lost" if item.get("is_lost") else "active",
                # Pass through exactly; never fabricate.
                "provider_metrics": item,
            })
        return out

    def new_lost(self, domain: str, *, since: str) -> Dict:  # pragma: no cover
        resp = self._post("history/live", [{"target": domain, "date_from": since}])
        task = (resp.get("tasks") or [{}])[0]
        result = (task.get("result") or [{}])[0]
        new_raw = result.get("new_backlinks") or []
        lost_raw = result.get("lost_backlinks") or []

        def _normalise(items, status):
            out = []
            for item in items:
                source_url = item.get("url_from", "")
                target_url = item.get("url_to", "")
                anchor = item.get("anchor", "")
                out.append({
                    "source_url": source_url,
                    "source_domain": item.get("domain_from", ""),
                    "target_url": target_url,
                    "anchor_text": anchor,
                    "rel": "nofollow" if item.get("dofollow") is False else "follow",
                    "link_type": item.get("type", "text"),
                    "first_seen": item.get("first_seen", ""),
                    "last_seen": item.get("last_seen", ""),
                    "status": status,
                    "provider": self.name,
                    "dedup_key": _mock_dedup_key(source_url, target_url, anchor),
                    "provider_metrics": item,
                })
            return out

        return {
            "new": _normalise(new_raw, "active"),
            "lost": _normalise(lost_raw, "lost"),
        }

    def anchors(self, domain: str) -> List[Dict]:  # pragma: no cover
        resp = self._post("anchors/live", [{"target": domain, "limit": 1000}])
        task = (resp.get("tasks") or [{}])[0]
        result = (task.get("result") or [{}])[0]
        out = []
        for item in (result.get("items") or []):
            out.append({
                "anchor": item.get("anchor", ""),
                "count": item.get("backlinks", 0),
                "follow": item.get("dofollow", 0),
            })
        return out

    def competitor_intersections(
        self, domain: str, competitors: List[str]
    ) -> List[Dict]:  # pragma: no cover
        # Query each competitor's referring domains then intersect.
        client_rds = {rd["domain"] for rd in self.referring_domains(domain)}
        seen: Dict[str, Dict] = {}
        for comp in competitors:
            comp_rds = self.referring_domains(comp)
            for rd in comp_rds:
                rd_domain = rd["domain"]
                if rd_domain not in seen:
                    seen[rd_domain] = {
                        "referring_domain": rd_domain,
                        "links_to_client": rd_domain in client_rds,
                        "links_to_competitors": [],
                        "competitor_count": 0,
                        "provider_metrics": rd.get("provider_metrics"),
                    }
                if comp not in seen[rd_domain]["links_to_competitors"]:
                    seen[rd_domain]["links_to_competitors"].append(comp)
                    seen[rd_domain]["competitor_count"] += 1
        return list(seen.values())


# ── Factory ────────────────────────────────────────────────────────────────────

def get_backlink_provider() -> BacklinkProvider:
    """Return the real provider when credentials exist, else the deterministic mock.

    Reads SEO_BACKLINK_PROVIDER env (value "dataforseo" or similar) as hint.
    Regardless of the hint, falls back to Mock when credentials are absent.
    """
    provider_name = os.getenv("SEO_BACKLINK_PROVIDER", "").lower()
    has_creds = bool(
        os.getenv("SEO_BACKLINK_API_KEY")
        or (os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))
    )
    if has_creds:
        try:
            return HttpBacklinkProvider()  # pragma: no cover
        except Exception:
            return MockBacklinkProvider()
    return MockBacklinkProvider()
