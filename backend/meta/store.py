"""Meta asset store — per-tenant DISPLAY assets + selected defaults (durable).

This holds ONLY frontend-safe data: asset ids, names, usernames, tasks, mode.
It NEVER holds access tokens — those live server-side in the connections store
(see token_service). `set_assets` strips any token before persisting, so a token
can never leak through /api/meta/assets. Durable via persistence.py when
PIXIE_PERSIST is on (survives restart); in-memory otherwise.
"""

from __future__ import annotations

from typing import Optional

import persistence

_TOKEN_KEYS = ("page_access_token", "access_token", "user_token", "token")


def _safe_page(page: dict) -> dict:
    return {k: v for k, v in page.items() if k not in _TOKEN_KEYS}


def _sanitize(assets: dict) -> dict:
    return {
        "facebook_pages": [_safe_page(p) for p in assets.get("facebook_pages", [])],
        "instagram_accounts": list(assets.get("instagram_accounts", [])),
        "ad_accounts": list(assets.get("ad_accounts", [])),
    }


class _Store:
    def __init__(self) -> None:
        snap = persistence.load("meta_store", {}) or {}
        self._assets: dict[str, dict] = snap.get("assets", {})
        self._defaults: dict[str, dict] = snap.get("defaults", {})
        self._mode: dict[str, str] = snap.get("mode", {})

    def _persist(self) -> None:
        persistence.save("meta_store", {"assets": self._assets, "defaults": self._defaults,
                                        "mode": self._mode})

    def set_assets(self, tenant_id: str, assets: dict, mode: str = "live") -> None:
        self._assets[tenant_id] = _sanitize(assets)  # tokens stripped here
        self._mode[tenant_id] = mode
        d = self._defaults.setdefault(tenant_id, {})
        if assets.get("facebook_pages"):
            d.setdefault("page_id", assets["facebook_pages"][0]["id"])
        if assets.get("instagram_accounts"):
            d.setdefault("instagram_id", assets["instagram_accounts"][0]["id"])
        if assets.get("ad_accounts"):
            d.setdefault("ad_account_id", assets["ad_accounts"][0]["id"])
        self._persist()

    def get_assets(self, tenant_id: str) -> dict:
        return self._assets.get(tenant_id, {"facebook_pages": [], "instagram_accounts": [], "ad_accounts": []})

    def mode(self, tenant_id: str) -> Optional[str]:
        return self._mode.get(tenant_id)

    def set_defaults(self, tenant_id: str, **kw) -> dict:
        d = self._defaults.setdefault(tenant_id, {})
        d.update({k: v for k, v in kw.items() if v})
        self._persist()
        return d

    def defaults(self, tenant_id: str) -> dict:
        return self._defaults.get(tenant_id, {})

    def clear(self, tenant_id: str) -> None:
        self._assets.pop(tenant_id, None)
        self._defaults.pop(tenant_id, None)
        self._mode.pop(tenant_id, None)
        self._persist()


_store: Optional[_Store] = None


def get_meta_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store
