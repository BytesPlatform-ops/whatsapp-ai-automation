"""Persistence — one interface, three backends: memory | file | supabase.

The Python backend has no ORM. This layer lets the in-memory stores become
durable and multi-instance safe without a parallel DB:

  - `load(name)` / `save(name, data)`  — KV (a whole collection as one JSONB blob).
    Used for low-churn per-tenant caches (Meta asset cache, connection tokens).
  - `table(name)` -> Repo               — a ROW repository (insert/upsert/get/
    list_by_tenant/delete/query_by_fields). Used for transactional records
    (approvals, activity, content assets, meta content items, tool executions) so
    concurrent writers append rows instead of clobbering a shared blob.

Backend chosen by env (PIXIE_PERSIST):
    unset / memory  → in-process only (pytest default; hermetic)
    file            → JSON under .pixie_data/ (durable, single-instance)
    supabase        → Postgres via the Supabase REST API (durable, multi-instance)

Supabase mode needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side only,
never sent to the frontend). Missing → a clear error, not a silent fallback.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_LOCK = threading.RLock()


class PersistenceNotConfigured(RuntimeError):
    pass


def backend() -> str:
    raw = os.getenv("PIXIE_PERSIST", "").strip().lower()
    if raw in ("1", "true", "yes", "on", "file"):
        return "file"
    if raw == "supabase":
        return "supabase"
    return "memory"


def enabled() -> bool:
    return backend() != "memory"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _dir() -> Path:
    d = Path(os.getenv("PIXIE_DATA_DIR", str(Path(__file__).resolve().parent / ".pixie_data")))
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Supabase REST helpers ─────────────────────────────────────────────────────

def _sb_url() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def _sb_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def supabase_configured() -> bool:
    return bool(_sb_url() and _sb_key())


def require_supabase() -> None:
    if backend() == "supabase" and not supabase_configured():
        raise PersistenceNotConfigured(
            "PIXIE_PERSIST=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. "
            "Add them to the backend environment (server-side only)."
        )


def _sb_headers(extra: Optional[dict] = None) -> dict:
    h = {"apikey": _sb_key(), "Authorization": f"Bearer {_sb_key()}",
         "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def _sb_rest(table: str) -> str:
    return f"{_sb_url()}/rest/v1/{table}"


# ── KV API (whole-collection blob) ────────────────────────────────────────────

def load(name: str, default):
    b = backend()
    if b == "memory":
        return default
    if b == "file":
        path = _dir() / f"{name}.json"
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return default
    # supabase KV — a pixie_kv row keyed by name
    require_supabase()
    import httpx

    try:
        with httpx.Client(timeout=20) as http:
            r = http.get(_sb_rest("pixie_kv"), headers=_sb_headers(),
                         params={"name": f"eq.{name}", "select": "data"})
            if r.status_code == 200 and r.json():
                return r.json()[0].get("data", default)
    except httpx.HTTPError:
        pass
    return default


def save(name: str, data) -> None:
    b = backend()
    if b == "memory":
        return
    if b == "file":
        with _LOCK:
            path = _dir() / f"{name}.json"
            tmp = path.with_suffix(".tmp")
            try:
                tmp.write_text(json.dumps(data, default=str, ensure_ascii=False, indent=2),
                               encoding="utf-8")
                tmp.replace(path)
                os.chmod(path, 0o600)
            except OSError:
                pass
        return
    require_supabase()
    import httpx

    with httpx.Client(timeout=20) as http:
        http.post(_sb_rest("pixie_kv"),
                  headers=_sb_headers({"Prefer": "resolution=merge-duplicates"}),
                  json={"name": name, "data": data, "updated_at": _now()})


# ── Row repository API ────────────────────────────────────────────────────────

class Repo:
    """Row store for one table. Rows are plain dicts with `id` + `tenant_id`."""

    def __init__(self, name: str) -> None:
        self.name = name

    # subclasses implement these
    def upsert(self, row: dict) -> dict: ...
    def get(self, tenant_id: str, row_id: str) -> Optional[dict]: ...
    def list_by_tenant(self, tenant_id: str) -> list[dict]: ...
    def delete(self, tenant_id: str, row_id: str) -> bool: ...
    def query_by_fields(self, tenant_id: str, **eq) -> list[dict]:
        return [r for r in self.list_by_tenant(tenant_id)
                if all(r.get(k) == v for k, v in eq.items())]


class _MemoryRepo(Repo):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self._rows: list[dict] = []  # insertion-ordered

    def _idx(self, tenant_id: str, row_id: str) -> int:
        for i, r in enumerate(self._rows):
            if r["id"] == row_id and r["tenant_id"] == tenant_id:
                return i
        return -1

    def upsert(self, row: dict) -> dict:
        row.setdefault("created_at", _now())
        i = self._idx(row["tenant_id"], row["id"])
        if i >= 0:
            self._rows[i] = row
        else:
            self._rows.append(row)
        return row

    def get(self, tenant_id: str, row_id: str) -> Optional[dict]:
        i = self._idx(tenant_id, row_id)
        return self._rows[i] if i >= 0 else None

    def list_by_tenant(self, tenant_id: str) -> list[dict]:
        return [r for r in self._rows if r["tenant_id"] == tenant_id]

    def delete(self, tenant_id: str, row_id: str) -> bool:
        i = self._idx(tenant_id, row_id)
        if i >= 0:
            self._rows.pop(i)
            return True
        return False


class _FileRepo(_MemoryRepo):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        path = _dir() / f"row_{name}.json"
        if path.exists():
            try:
                self._rows = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                self._rows = []

    def _flush(self) -> None:
        with _LOCK:
            path = _dir() / f"row_{self.name}.json"
            tmp = path.with_suffix(".tmp")
            try:
                tmp.write_text(json.dumps(self._rows, default=str, ensure_ascii=False, indent=2),
                               encoding="utf-8")
                tmp.replace(path)
                os.chmod(path, 0o600)
            except OSError:
                pass

    def upsert(self, row: dict) -> dict:
        r = super().upsert(row)
        self._flush()
        return r

    def delete(self, tenant_id: str, row_id: str) -> bool:
        ok = super().delete(tenant_id, row_id)
        if ok:
            self._flush()
        return ok


class _SupabaseRepo(Repo):
    def upsert(self, row: dict) -> dict:
        require_supabase()
        row.setdefault("created_at", _now())
        import httpx

        with httpx.Client(timeout=20) as http:
            r = http.post(_sb_rest(self.name),
                          headers=_sb_headers({"Prefer": "resolution=merge-duplicates,return=representation"}),
                          json=row)
            if r.status_code >= 300:
                raise PersistenceNotConfigured(
                    f"Supabase upsert into {self.name} failed: {r.status_code} {r.text[:200]}")
        return row

    def get(self, tenant_id: str, row_id: str) -> Optional[dict]:
        require_supabase()
        import httpx

        with httpx.Client(timeout=20) as http:
            r = http.get(_sb_rest(self.name), headers=_sb_headers(),
                         params={"id": f"eq.{row_id}", "tenant_id": f"eq.{tenant_id}", "limit": 1})
            rows = r.json() if r.status_code == 200 else []
        return rows[0] if rows else None

    def list_by_tenant(self, tenant_id: str) -> list[dict]:
        require_supabase()
        import httpx

        with httpx.Client(timeout=20) as http:
            r = http.get(_sb_rest(self.name), headers=_sb_headers(),
                         params={"tenant_id": f"eq.{tenant_id}", "order": "created_at.asc"})
            return r.json() if r.status_code == 200 else []

    def delete(self, tenant_id: str, row_id: str) -> bool:
        require_supabase()
        import httpx

        with httpx.Client(timeout=20) as http:
            r = http.delete(_sb_rest(self.name), headers=_sb_headers(),
                            params={"id": f"eq.{row_id}", "tenant_id": f"eq.{tenant_id}"})
        return r.status_code < 300


def envelope(row_id: str, tenant_id: str, data: dict, created_at: Optional[str] = None) -> dict:
    """Wrap a record as a normalized row: (id, tenant_id, created_at, updated_at, data jsonb).

    One row per record → concurrent writers append/update their own row instead of
    clobbering a shared blob. Fields stay queryable in Postgres via data->>'field'.
    """
    return {"id": row_id, "tenant_id": tenant_id,
            "created_at": created_at or _now(), "updated_at": _now(), "data": data}


def table(name: str) -> Repo:
    """Return a Repo for the current backend. A fresh instance each call:
    memory repos are per-store (so a store reset = clean data, keeping tests
    hermetic); file/supabase repos read shared backing so instances stay in sync."""
    b = backend()
    if b == "file":
        return _FileRepo(name)
    if b == "supabase":
        require_supabase()
        return _SupabaseRepo(name)
    return _MemoryRepo(name)


def status() -> dict:
    """Frontend-safe persistence status (no secrets)."""
    b = backend()
    return {
        "backend": b,
        "durable": b != "memory",
        "multi_instance": b == "supabase",
        "supabase_configured": supabase_configured(),
        "warning": ("File persistence is for local development only. Use PIXIE_PERSIST=supabase "
                    "for production (multi-instance).") if b == "file" else "",
    }
