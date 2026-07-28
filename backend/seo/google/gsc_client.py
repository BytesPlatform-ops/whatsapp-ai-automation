"""Provider abstraction for Google Search Console (Search Analytics).

Protocol: GscClient
  list_properties(access_token) -> list[dict]
  query_search_analytics(access_token, property_id, start, end,
                         dimensions, start_row, row_limit) -> {rows, next_start_row}

Implementations:
  MockGscClient  — deterministic, hash-based, paginates, zero network calls.
  HttpGscClient  — real Google API, only ever instantiated when both real creds
                   and RUN_LIVE_GOOGLE_TESTS env are set.

Factory:
  get_gsc_client()  — returns Mock unless env gate is open.

Typed error: GscError (raised for quota / API errors).

Environment variables:
  RUN_LIVE_GOOGLE_TESTS  — set to "1" to allow HttpGscClient in tests (default off).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

_log = logging.getLogger("pixie.seo.google.gsc_client")


class GscError(Exception):
    """Raised by GscClient implementations on quota / API errors."""

    def __init__(self, message: str, status_code: int = 0, reason: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.reason = reason


# ── Abstract protocol ──────────────────────────────────────────────────────────

class GscClient(ABC):
    """Minimal GSC surface needed by the sync engine."""

    @abstractmethod
    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        """Return a list of property descriptors.

        Each dict has at least:
          property_id    str  e.g. "sc-domain:example.com"
          property_type  str  "domain" | "url_prefix"
          display_name   str
          permission_level str  "siteOwner" | "siteFullUser" | "siteRestrictedUser"
        """

    @abstractmethod
    def query_search_analytics(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        dimensions: Optional[List[str]] = None,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        """Query search analytics.

        Returns:
          {
            "rows": [ {query, page, country, device, date,
                       clicks, impressions, ctr, position}, ... ],
            "next_start_row": int | None  (None = last page)
          }
        """


# ── Mock implementation ────────────────────────────────────────────────────────

_MOCK_PROPERTIES = [
    {
        "property_id": "sc-domain:example.com",
        "property_type": "domain",
        "display_name": "example.com",
        "permission_level": "siteOwner",
    },
    {
        "property_id": "https://www.example.com/",
        "property_type": "url_prefix",
        "display_name": "https://www.example.com/",
        "permission_level": "siteFullUser",
    },
]

_MOCK_QUERIES = [
    "best seo tool", "seo audit", "google search console", "rank tracker",
    "keyword research", "site speed test", "backlink checker", "technical seo",
    "seo checklist", "website audit",
]

_MOCK_PAGES = ["/", "/pricing", "/blog", "/features", "/contact"]
_MOCK_COUNTRIES = ["usa", "gbr", "can", "aus", "ind"]
_MOCK_DEVICES = ["DESKTOP", "MOBILE", "TABLET"]


def _mock_row(seed: str, date: str) -> Dict[str, Any]:
    """Generate a deterministic row from a hash seed."""
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    clicks = (h % 150) + 1
    impressions = clicks * ((h % 20) + 5)
    ctr = round(clicks / impressions, 4) if impressions else 0.0
    position = round(1 + (h % 50) + (h % 10) * 0.1, 1)
    query_idx = h % len(_MOCK_QUERIES)
    page_idx = (h >> 4) % len(_MOCK_PAGES)
    country_idx = (h >> 8) % len(_MOCK_COUNTRIES)
    device_idx = (h >> 12) % len(_MOCK_DEVICES)
    return {
        "query": _MOCK_QUERIES[query_idx],
        "page": _MOCK_PAGES[page_idx],
        "country": _MOCK_COUNTRIES[country_idx],
        "device": _MOCK_DEVICES[device_idx],
        "date": date,
        "clicks": clicks,
        "impressions": impressions,
        "ctr": ctr,
        "position": position,
    }


_MOCK_ROWS_PER_DATE = 8  # deterministic size per date window


class MockGscClient(GscClient):
    """Deterministic, hermetic mock — zero network calls."""

    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        return list(_MOCK_PROPERTIES)

    def query_search_analytics(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        dimensions: Optional[List[str]] = None,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        if dimensions is None:
            dimensions = ["query", "page", "country", "device", "date"]

        # Generate deterministic rows keyed by property + start + row index
        all_rows = []
        for i in range(_MOCK_ROWS_PER_DATE):
            seed = f"{property_id}:{start}:{end}:{i}"
            all_rows.append(_mock_row(seed, start))

        page = all_rows[start_row: start_row + row_limit]
        end_row = start_row + len(page)
        next_start = end_row if end_row < len(all_rows) else None

        return {"rows": page, "next_start_row": next_start}


# ── Real (HTTP) implementation ─────────────────────────────────────────────────

class HttpGscClient(GscClient):
    """Real Google Search Console API client.

    urllib is imported lazily so this file can be imported in tests without
    triggering any network calls (the factory always returns Mock in tests).
    """

    _GSC_BASE = "https://www.googleapis.com/webmasters/v3"

    def _get(self, access_token: str, url: str) -> Dict[str, Any]:
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            status = getattr(getattr(exc, "code", None), "__int__", lambda: 0)()
            raise GscError(str(exc), status_code=status) from exc

    def _post(self, access_token: str, url: str, payload: dict) -> Dict[str, Any]:
        import urllib.request
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            code = getattr(exc, "code", 0) or 0
            try:
                detail = json.loads(exc.read().decode("utf-8"))
                reason = detail.get("error", {}).get("message", str(exc))
            except Exception:
                reason = str(exc)
            if code == 429:
                raise GscError(f"GSC quota exceeded: {reason}", status_code=429, reason="quota") from exc
            raise GscError(f"GSC API error {code}: {reason}", status_code=code, reason=reason) from exc

    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        data = self._get(access_token, f"{self._GSC_BASE}/sites")
        out = []
        for entry in data.get("siteEntry", []):
            out.append({
                "property_id": entry.get("siteUrl", ""),
                "property_type": "domain" if entry.get("siteUrl", "").startswith("sc-domain:") else "url_prefix",
                "display_name": entry.get("siteUrl", ""),
                "permission_level": entry.get("permissionLevel", ""),
            })
        return out

    def query_search_analytics(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        dimensions: Optional[List[str]] = None,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        if dimensions is None:
            dimensions = ["query", "page", "country", "device", "date"]

        import urllib.parse
        encoded = urllib.parse.quote(property_id, safe="")
        url = f"{self._GSC_BASE}/sites/{encoded}/searchAnalytics/query"

        payload = {
            "startDate": start,
            "endDate": end,
            "dimensions": dimensions,
            "startRow": start_row,
            "rowLimit": min(row_limit, 25000),
        }
        data = self._post(access_token, url, payload)

        rows = []
        for raw in data.get("rows", []):
            keys = raw.get("keys", [])
            row: Dict[str, Any] = {
                "clicks": int(raw.get("clicks", 0)),
                "impressions": int(raw.get("impressions", 0)),
                "ctr": round(float(raw.get("ctr", 0.0)), 6),
                "position": round(float(raw.get("position", 0.0)), 2),
            }
            for i, dim in enumerate(dimensions):
                if i < len(keys):
                    row[dim] = keys[i]
                else:
                    row[dim] = ""
            rows.append(row)

        # GSC doesn't return a next-page token; pagination uses startRow offsets.
        next_start = start_row + len(rows) if len(rows) == row_limit else None
        return {"rows": rows, "next_start_row": next_start}


# ── Factory ────────────────────────────────────────────────────────────────────

def get_gsc_client() -> GscClient:
    """Return the appropriate GSC client.

    Returns MockGscClient unless BOTH:
      - RUN_LIVE_GOOGLE_TESTS=1 is set, AND
      - GOOGLE_CLIENT_ID is set (indicates real creds are present).
    """
    if (
        os.getenv("RUN_LIVE_GOOGLE_TESTS", "").strip() == "1"
        and os.getenv("GOOGLE_CLIENT_ID", "").strip()
    ):
        _log.info("seo.google.gsc_client: using HttpGscClient (live mode)")
        return HttpGscClient()
    return MockGscClient()
