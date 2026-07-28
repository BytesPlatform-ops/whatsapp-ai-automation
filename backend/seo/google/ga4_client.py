"""Provider abstraction for Google Analytics 4 (Data API).

Protocol: Ga4Client
  list_properties(access_token) -> list[dict]
  run_report(access_token, property_id, start, end,
             start_row, row_limit) -> {rows, next_start_row}

Metrics collected per landing page:
  sessions, engagedSessions, engagementRate, averageEngagementTime,
  newUsers, conversions

Dimensions:
  landingPage, sessionSourceMedium, deviceCategory, country, date

Implementations:
  MockGa4Client  — deterministic, hash-based, paginates, zero network calls.
  HttpGa4Client  — real GA4 Data API, gated behind RUN_LIVE_GOOGLE_TESTS.

Factory:
  get_ga4_client() — returns Mock unless env gate is open.

Typed error: Ga4Error (raised for quota / API errors).

Environment variables:
  RUN_LIVE_GOOGLE_TESTS  — set to "1" to allow HttpGa4Client (default off).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

_log = logging.getLogger("pixie.seo.google.ga4_client")

GA4_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta"


class Ga4Error(Exception):
    """Raised by Ga4Client implementations on quota / API errors."""

    def __init__(self, message: str, status_code: int = 0, reason: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.reason = reason


# ── Abstract protocol ──────────────────────────────────────────────────────────

class Ga4Client(ABC):

    @abstractmethod
    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        """Return list of GA4 property descriptors.

        Each dict has at least:
          property_id   str  e.g. "properties/123456"
          display_name  str
          property_type str  "ga4"
        """

    @abstractmethod
    def run_report(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        """Run a landing-page organic traffic report.

        Returns:
          {
            "rows": [
              {
                "landing_page": str,
                "source_medium": str,
                "device_category": str,
                "country": str,
                "date": str,
                "sessions": int,
                "engaged_sessions": int,
                "engagement_rate": float,
                "avg_engagement_time": float,
                "new_users": int,
                "conversions": float,
              },
              ...
            ],
            "next_start_row": int | None
          }
        """


# ── Mock implementation ────────────────────────────────────────────────────────

_MOCK_GA4_PROPERTIES = [
    {
        "property_id": "properties/123456789",
        "display_name": "Example Website (GA4)",
        "property_type": "ga4",
    },
    {
        "property_id": "properties/987654321",
        "display_name": "Example Blog (GA4)",
        "property_type": "ga4",
    },
]

_MOCK_LANDINGS = ["/", "/pricing", "/blog/seo-guide", "/features", "/contact"]
_MOCK_SOURCES = ["google / organic", "bing / organic", "(direct) / (none)"]
_MOCK_DEVICES = ["desktop", "mobile", "tablet"]
_MOCK_COUNTRIES = ["United States", "United Kingdom", "Canada", "Australia", "India"]
_MOCK_ROWS_PER_DATE = 6


def _ga4_mock_row(seed: str, date: str) -> Dict[str, Any]:
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    sessions = (h % 200) + 5
    engaged = int(sessions * (0.4 + (h % 6) * 0.1))
    eng_rate = round(engaged / sessions, 4) if sessions else 0.0
    avg_time = round(30 + (h % 120), 1)
    new_users = int(sessions * (0.3 + (h % 5) * 0.1))
    conversions = round((h % 10) * 0.5, 2)
    landing = _MOCK_LANDINGS[h % len(_MOCK_LANDINGS)]
    source = _MOCK_SOURCES[(h >> 4) % len(_MOCK_SOURCES)]
    device = _MOCK_DEVICES[(h >> 8) % len(_MOCK_DEVICES)]
    country = _MOCK_COUNTRIES[(h >> 12) % len(_MOCK_COUNTRIES)]
    return {
        "landing_page": landing,
        "source_medium": source,
        "device_category": device,
        "country": country,
        "date": date,
        "sessions": sessions,
        "engaged_sessions": engaged,
        "engagement_rate": eng_rate,
        "avg_engagement_time": avg_time,
        "new_users": new_users,
        "conversions": conversions,
    }


class MockGa4Client(Ga4Client):
    """Deterministic, hermetic mock — zero network calls."""

    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        return list(_MOCK_GA4_PROPERTIES)

    def run_report(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        all_rows = []
        for i in range(_MOCK_ROWS_PER_DATE):
            seed = f"{property_id}:{start}:{end}:{i}"
            all_rows.append(_ga4_mock_row(seed, start))

        page = all_rows[start_row: start_row + row_limit]
        end_idx = start_row + len(page)
        next_start = end_idx if end_idx < len(all_rows) else None

        return {"rows": page, "next_start_row": next_start}


# ── Real (HTTP) implementation ─────────────────────────────────────────────────

class HttpGa4Client(Ga4Client):
    """Real GA4 Data API client.

    urllib is imported lazily so the module can be imported in tests without
    triggering any network calls.
    """

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
                raise Ga4Error(f"GA4 quota exceeded: {reason}", status_code=429, reason="quota") from exc
            raise Ga4Error(f"GA4 API error {code}: {reason}", status_code=code, reason=reason) from exc

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
            raise Ga4Error(str(exc)) from exc

    def list_properties(self, access_token: str) -> List[Dict[str, Any]]:
        # GA4 Management API v1alpha for listing properties
        url = "https://analyticsadmin.googleapis.com/v1alpha/properties"
        data = self._get(access_token, url)
        out = []
        for p in data.get("properties", []):
            out.append({
                "property_id": p.get("name", ""),  # e.g. "properties/123"
                "display_name": p.get("displayName", ""),
                "property_type": "ga4",
            })
        return out

    def run_report(
        self,
        access_token: str,
        property_id: str,
        start: str,
        end: str,
        start_row: int = 0,
        row_limit: int = 500,
    ) -> Dict[str, Any]:
        url = f"{GA4_DATA_API_BASE}/{property_id}:runReport"

        payload = {
            "dateRanges": [{"startDate": start, "endDate": end}],
            "dimensions": [
                {"name": "landingPage"},
                {"name": "sessionSourceMedium"},
                {"name": "deviceCategory"},
                {"name": "country"},
                {"name": "date"},
            ],
            "metrics": [
                {"name": "sessions"},
                {"name": "engagedSessions"},
                {"name": "engagementRate"},
                {"name": "averageEngagementTimePerSession"},
                {"name": "newUsers"},
                {"name": "conversions"},
            ],
            "offset": start_row,
            "limit": min(row_limit, 100000),
        }

        data = self._post(access_token, url, payload)

        dim_headers = [h.get("name", "") for h in data.get("dimensionHeaders", [])]
        met_headers = [h.get("name", "") for h in data.get("metricHeaders", [])]

        rows = []
        for raw_row in data.get("rows", []):
            dim_vals = [d.get("value", "") for d in raw_row.get("dimensionValues", [])]
            met_vals = [m.get("value", "0") for m in raw_row.get("metricValues", [])]

            dim_map = dict(zip(dim_headers, dim_vals))
            met_map = dict(zip(met_headers, met_vals))

            rows.append({
                "landing_page": dim_map.get("landingPage", ""),
                "source_medium": dim_map.get("sessionSourceMedium", ""),
                "device_category": dim_map.get("deviceCategory", ""),
                "country": dim_map.get("country", ""),
                "date": dim_map.get("date", ""),
                "sessions": int(float(met_map.get("sessions", 0))),
                "engaged_sessions": int(float(met_map.get("engagedSessions", 0))),
                "engagement_rate": round(float(met_map.get("engagementRate", 0.0)), 6),
                "avg_engagement_time": round(float(met_map.get("averageEngagementTimePerSession", 0.0)), 2),
                "new_users": int(float(met_map.get("newUsers", 0))),
                "conversions": round(float(met_map.get("conversions", 0.0)), 4),
            })

        row_count = data.get("rowCount", 0)
        next_start = start_row + len(rows) if (start_row + len(rows)) < row_count else None

        return {"rows": rows, "next_start_row": next_start}


# ── Factory ────────────────────────────────────────────────────────────────────

def get_ga4_client() -> Ga4Client:
    """Return the appropriate GA4 client.

    Returns MockGa4Client unless BOTH:
      - RUN_LIVE_GOOGLE_TESTS=1 is set, AND
      - GOOGLE_CLIENT_ID is set.
    """
    if (
        os.getenv("RUN_LIVE_GOOGLE_TESTS", "").strip() == "1"
        and os.getenv("GOOGLE_CLIENT_ID", "").strip()
    ):
        _log.info("seo.google.ga4_client: using HttpGa4Client (live mode)")
        return HttpGa4Client()
    return MockGa4Client()
