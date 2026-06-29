"""Concrete channel adapters — one file per platform.

Each adapter subclasses `channels.base.ChannelAdapter` (or `channels.mock.
MockAdapterBase` for the mock fallback) and keeps that channel's rules (limits,
windows, templates, opt-out) INSIDE the adapter. The lead wires them onto the
router in `channels/registry.py`; nothing here edits the router or schemas.
"""

from __future__ import annotations

__all__: list[str] = []
