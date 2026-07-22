"""Timezone-aware scheduling — PURE STDLIB (zoneinfo).

Users schedule in a local IANA timezone; we store the canonical execution time in
UTC plus the original local time + timezone. DST transitions are handled: a
nonexistent local time (spring-forward gap) is rejected; an ambiguous local time
(fall-back overlap) is resolved to the earlier offset and flagged. The server's
own timezone is never used.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ScheduleError(ValueError):
    """Invalid timezone or an impossible local time."""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_utc_iso() -> str:
    return now_utc().isoformat(timespec="seconds")


def valid_timezone(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return False


def _parse_local(local_iso: str) -> datetime:
    s = (local_iso or "").strip().replace("Z", "").split("+")[0]
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ScheduleError(f"Unparseable local time: {local_iso!r} (use YYYY-MM-DDTHH:MM).")


@dataclass
class ResolvedSchedule:
    utc_iso: str
    local_iso: str
    timezone: str
    ambiguous: bool
    utc_offset_minutes: int


def resolve(local_iso: str, tz: str) -> ResolvedSchedule:
    """Resolve a local wall-clock time in IANA ``tz`` to a canonical UTC instant.

    Raises :class:`ScheduleError` for an unknown timezone or a nonexistent local
    time (DST gap). Ambiguous times (DST overlap) resolve to the earlier offset
    (``fold=0``) and set ``ambiguous=True``.
    """
    if not valid_timezone(tz):
        raise ScheduleError(f"Unknown timezone: {tz!r} (use an IANA name like 'America/New_York').")
    zi = ZoneInfo(tz)
    naive = _parse_local(local_iso)
    aware = naive.replace(tzinfo=zi)                 # fold=0 (earlier offset)
    utc = aware.astimezone(timezone.utc)

    # Nonexistent local time: converting to UTC and back changes the wall time.
    roundtrip = utc.astimezone(zi).replace(tzinfo=None)
    if roundtrip != naive:
        raise ScheduleError(
            f"{local_iso} does not exist in {tz} (daylight-saving gap). Choose another time.")

    ambiguous = aware.utcoffset() != naive.replace(tzinfo=zi, fold=1).utcoffset()
    offset_min = int((aware.utcoffset().total_seconds() // 60)) if aware.utcoffset() else 0
    return ResolvedSchedule(
        utc_iso=utc.isoformat(timespec="seconds"),
        local_iso=naive.isoformat(timespec="minutes"),
        timezone=tz,
        ambiguous=ambiguous,
        utc_offset_minutes=offset_min,
    )


def is_past(utc_iso: str, *, skew_seconds: int = 60) -> bool:
    """True when ``utc_iso`` is meaningfully in the past (beyond a small skew)."""
    try:
        dt = datetime.fromisoformat(utc_iso)
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (now_utc() - dt).total_seconds() > skew_seconds
