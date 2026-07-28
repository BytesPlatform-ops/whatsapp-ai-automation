"""CSV import/export for keyword data.

CSV formula-injection safety:
  Any value that starts with =, +, -, @, tab (0x09) or carriage-return (0x0D)
  is prefixed with a single quote before being placed in the CSV cell. This
  follows the OWASP recommendation and prevents spreadsheet applications from
  evaluating the cell as a formula.

Import:
  Accepts CSV text with an optional header row. Recognised column names
  (case-insensitive, whitespace-stripped):
    keyword, volume, search_volume, cpc, competition, difficulty, intent,
    tags, target_page, notes, data_provider, data_timestamp

  Rows without a non-empty ``keyword`` column are silently skipped.

Export:
  Accepts a list of dicts (the same shape returned by ``_keyword_to_dict``).
  Serialises only human-readable columns (skips internal IDs/timestamps beyond
  created_at for audit purposes).
"""

from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional

# Columns emitted in export (order matters — determines CSV column order).
EXPORT_COLUMNS = [
    "keyword",
    "search_volume",
    "cpc",
    "competition",
    "difficulty",
    "intent",
    "tracking_status",
    "target_page",
    "tags",
    "serp_features",
    "notes",
    "data_provider",
    "data_timestamp",
    "created_at",
]

# Recognised import column aliases (maps alias -> canonical field name).
_IMPORT_ALIASES: Dict[str, str] = {
    "keyword": "keyword",
    "volume": "search_volume",
    "search_volume": "search_volume",
    "cpc": "cpc",
    "cost_per_click": "cpc",
    "competition": "competition",
    "difficulty": "difficulty",
    "kd": "difficulty",
    "intent": "intent",
    "tags": "tags",
    "target_page": "target_page",
    "target url": "target_page",
    "notes": "notes",
    "data_provider": "data_provider",
    "data_timestamp": "data_timestamp",
}

# Characters at the start of a value that trigger injection escaping.
_INJECTION_CHARS = frozenset("=+-@\t\r")


def _escape_cell(value: str) -> str:
    """Guard a cell value against CSV formula injection.

    If the string begins with any character in ``_INJECTION_CHARS`` it is
    prefixed with a single quote so spreadsheet parsers treat it as text.
    """
    if value and value[0] in _INJECTION_CHARS:
        return "'" + value
    return value


def _coerce_int(v: str) -> Optional[int]:
    try:
        return int(float(v.strip()))
    except (ValueError, AttributeError):
        return None


def _coerce_float(v: str) -> Optional[float]:
    try:
        return round(float(v.strip()), 6)
    except (ValueError, AttributeError):
        return None


def import_csv(text: str) -> List[Dict[str, Any]]:
    """Parse CSV text into a list of keyword dicts suitable for ``add_keyword``.

    Rules:
    - First row is treated as a header when it contains at least one recognised
      column name. If no header is recognised, the first column is assumed to be
      ``keyword``.
    - Unrecognised columns are silently ignored.
    - Rows without a non-empty ``keyword`` value are silently skipped.
    - Numeric fields are coerced; tags/serp_features are split on ``|`` or ``;``.
    """
    text = (text or "").strip()
    if not text:
        return []

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    # Detect header row.
    first_row_lower = [c.strip().lower() for c in rows[0]]
    has_header = any(col in _IMPORT_ALIASES for col in first_row_lower)

    if has_header:
        header = first_row_lower
        data_rows = rows[1:]
    else:
        # No header detected: assume first col = keyword.
        header = ["keyword"] + ["_col{}".format(i) for i in range(1, len(rows[0]))]
        data_rows = rows

    results = []
    for row in data_rows:
        record: Dict[str, Any] = {}
        for i, cell in enumerate(row):
            if i >= len(header):
                break
            col = header[i]
            canonical = _IMPORT_ALIASES.get(col)
            if not canonical:
                continue
            cell_stripped = cell.strip()
            if canonical == "search_volume":
                record[canonical] = _coerce_int(cell_stripped) if cell_stripped else None
            elif canonical == "cpc":
                record[canonical] = _coerce_float(cell_stripped) if cell_stripped else None
            elif canonical == "competition":
                record[canonical] = _coerce_float(cell_stripped) if cell_stripped else None
            elif canonical == "difficulty":
                record[canonical] = _coerce_int(cell_stripped) if cell_stripped else None
            elif canonical == "tags":
                parts = [t.strip() for t in re.split(r"[|;]", cell_stripped) if t.strip()]
                record[canonical] = parts
            else:
                record[canonical] = cell_stripped

        kw = (record.get("keyword") or "").strip()
        if not kw:
            continue
        results.append(record)

    return results


def export_csv(rows: List[Dict[str, Any]]) -> str:
    """Serialise a list of keyword dicts to CSV text.

    Every string cell value is passed through ``_escape_cell`` to prevent
    formula injection. List fields (tags, serp_features) are joined with ``|``.
    Numeric fields are output as-is (numbers are not formula-injection vectors).
    """
    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")

    # Header row (headers themselves are safe plain strings).
    writer.writerow(EXPORT_COLUMNS)

    for row in rows:
        csv_row = []
        for col in EXPORT_COLUMNS:
            val = row.get(col)
            if val is None:
                csv_row.append("")
            elif isinstance(val, list):
                csv_row.append(_escape_cell("|".join(str(v) for v in val)))
            elif isinstance(val, (int, float)):
                csv_row.append(val)
            else:
                csv_row.append(_escape_cell(str(val)))
        writer.writerow(csv_row)

    return out.getvalue()


# Keep re available for import_csv tag splitting.
import re  # noqa: E402 — placed here to keep the module header clean
