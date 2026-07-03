"""Meta asset store — per-tenant discovered/demo assets + selected defaults.

In-memory (mirrors approvals/activity/leads). The OAuth callback (or the demo
connect) writes the discovered assets here; the dashboard reads them back and
the agent uses the selected defaults. Tokens are NOT stored here — those live in
the shared connections store (server-side, gitignored file).
"""

from __future__ import annotations

from typing import Optional


class _Store:
    def __init__(self) -> None:
        self._assets: dict[str, dict] = {}      # tenant -> {facebook_pages, instagram_accounts, ad_accounts}
        self._defaults: dict[str, dict] = {}    # tenant -> {page_id, instagram_id, ad_account_id}
        self._mode: dict[str, str] = {}         # tenant -> "live" | "demo"

    def set_assets(self, tenant_id: str, assets: dict, mode: str = "live") -> None:
        self._assets[tenant_id] = assets
        self._mode[tenant_id] = mode
        # sensible defaults on first connect
        d = self._defaults.setdefault(tenant_id, {})
        if assets.get("facebook_pages"):
            d.setdefault("page_id", assets["facebook_pages"][0]["id"])
        if assets.get("instagram_accounts"):
            d.setdefault("instagram_id", assets["instagram_accounts"][0]["id"])
        if assets.get("ad_accounts"):
            d.setdefault("ad_account_id", assets["ad_accounts"][0]["id"])

    def get_assets(self, tenant_id: str) -> dict:
        return self._assets.get(tenant_id, {"facebook_pages": [], "instagram_accounts": [], "ad_accounts": []})

    def mode(self, tenant_id: str) -> Optional[str]:
        return self._mode.get(tenant_id)

    def set_defaults(self, tenant_id: str, **kw) -> dict:
        d = self._defaults.setdefault(tenant_id, {})
        d.update({k: v for k, v in kw.items() if v})
        return d

    def defaults(self, tenant_id: str) -> dict:
        return self._defaults.get(tenant_id, {})

    def clear(self, tenant_id: str) -> None:
        self._assets.pop(tenant_id, None)
        self._defaults.pop(tenant_id, None)
        self._mode.pop(tenant_id, None)


_store: Optional[_Store] = None


def get_meta_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store
