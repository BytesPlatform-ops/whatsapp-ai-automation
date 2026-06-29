"""ChannelRouter — the one place inbound and outbound are wired to adapters.

    inbound:  (channel, tenant, raw) → adapter.normalize → log → owning service
              handler(InboundMessage) → optional OutboundMessage → send (dry-run)
    outbound: service hands an OutboundMessage → pick adapter → idempotency guard
              → adapter.send (dry-run by default) → log → SendResult

Services register a handler and call `send`; they never import an adapter or know
the channel. The router seeds a deterministic MOCK adapter for EVERY channel, so
the whole layer runs with no API keys; real adapters replace specific channels in
later waves via `register_adapter`.
"""

from __future__ import annotations

import inspect
from typing import Callable, Optional

from .base import ChannelAdapter
from .mock import MockAdapterBase
from .requirements import evaluate_requirements, support_level_for
from .schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    ChannelStatus,
    InboundMessage,
    OutboundMessage,
    SendResult,
)
from .store import get_channel_store, idempotency_key

# A service handler: receives a normalized InboundMessage, optionally returns an
# OutboundMessage to reply with. May be sync or async.
Handler = Callable[[InboundMessage], Optional[OutboundMessage]]


def _run_coro(coro):
    """Run a coroutine to completion from a SYNC context, whether or not an event
    loop is already running. `asyncio.get_event_loop().run_until_complete` is unsafe
    on 3.12 (no implicit loop) and inside a running loop (can't nest) — so: if a
    loop is already running on this thread, run the coroutine on a worker thread;
    otherwise `asyncio.run` it directly."""
    import asyncio

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)  # no loop running → safe to run our own

    # A loop is running on this thread (e.g. an async endpoint). Run on a worker.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(coro)).result()


class ChannelRouter:
    def __init__(self, store=None) -> None:
        self._adapters: dict[Channel, ChannelAdapter] = {ch: MockAdapterBase(ch) for ch in Channel}
        self._handlers: dict[str, Handler] = {}
        self._owners: dict[Channel, str] = {}  # channel -> service_name
        # Defaults to the process-wide store; pass a fresh InMemoryChannelStore()
        # for an isolated router (tests, or a second logical instance).
        self._store = store if store is not None else get_channel_store()
        # Optional cross-channel compliance gate: fn(msg, config, store) -> result
        # with `.allowed` / `.blocked_by`. Off by default (opt-in) so the base
        # router stays minimal; the app wires channels.compliance in.
        self._gate = None

    # ── adapter registry ─────────────────────────────────────────────────────
    def register_adapter(self, adapter: ChannelAdapter) -> None:
        """Replace the mock adapter for a channel with a richer one (Wave 2+)."""
        self._adapters[adapter.channel] = adapter

    def set_compliance_gate(self, gate) -> None:
        """Enable a cross-channel pre-send gate (consent/opt-out/rate-limit).

        `gate(msg, config, store)` must return an object with `.allowed: bool` and
        `.blocked_by: str|None` (see channels.compliance.evaluate_compliance)."""
        self._gate = gate

    def adapter_for(self, channel: Channel) -> ChannelAdapter:
        return self._adapters.get(channel) or MockAdapterBase(channel)

    # ── service handlers ─────────────────────────────────────────────────────
    def register_handler(self, service_name: str, callback: Handler,
                         channels: Optional[list[Channel]] = None) -> None:
        """A service registers ONE handler for normalized inbound messages.

        `channels` claims ownership of those channels for this service; if a
        service is the only one registered, it owns everything by default."""
        self._handlers[service_name] = callback
        for ch in (channels or []):
            self._owners[ch] = service_name

    def _resolve_handler(self, channel: Channel, service_name: Optional[str]) -> Optional[Handler]:
        if service_name:
            return self._handlers.get(service_name)
        owner = self._owners.get(channel)
        if owner:
            return self._handlers.get(owner)
        if len(self._handlers) == 1:  # sole service owns everything
            return next(iter(self._handlers.values()))
        return None

    # ── config helpers ───────────────────────────────────────────────────────
    def get_config(self, tenant_id: str, channel: Channel) -> ChannelConfig:
        """Stored config, or a safe default (disabled + mock) computed fresh."""
        cfg = self._store.get_config(tenant_id, channel)
        if cfg is None:
            cfg = ChannelConfig(tenant_id=tenant_id, channel=channel,
                                support_level=support_level_for(channel))
        return self.sync_requirements(cfg)

    def sync_requirements(self, config: ChannelConfig) -> ChannelConfig:
        """Recompute requirements_met + missing from the current config."""
        _reqs, missing, met = evaluate_requirements(config)
        config.missing = missing
        config.requirements_met = met
        config.support_level = support_level_for(config.channel)
        return config

    def save_config(self, config: ChannelConfig) -> ChannelConfig:
        return self._store.save_config(self.sync_requirements(config))

    def status(self, tenant_id: str, channel: Channel) -> ChannelStatus:
        cfg = self.get_config(tenant_id, channel)
        return self.adapter_for(channel).status(cfg)

    def all_status(self, tenant_id: str) -> list[ChannelStatus]:
        return [self.status(tenant_id, ch) for ch in Channel]

    # ── inbound ──────────────────────────────────────────────────────────────
    def route_inbound(self, channel: Channel, tenant_id: str, raw: dict,
                      service_name: Optional[str] = None) -> dict:
        """Normalize an inbound payload, hand it to the owning service, and send
        any reply (dry-run by default). Returns the inbound, reply, send result."""
        adapter = self.adapter_for(channel)
        self._store.log_webhook_event(tenant_id, channel, raw)
        inbound = adapter.normalize_inbound(tenant_id, raw)
        self._store.log_inbound(inbound)

        handler = self._resolve_handler(channel, service_name)
        reply: Optional[OutboundMessage] = None
        send_result: Optional[SendResult] = None
        if handler is not None:
            result = handler(inbound)
            if inspect.iscoroutine(result):  # support async service handlers safely
                result = _run_coro(result)
            if isinstance(result, OutboundMessage):
                reply = result
                # This is a reply to a message the customer JUST sent, so we are
                # inside the platform's customer-service window — tell the adapter
                # so window-gated channels (WhatsApp/IG/Messenger) don't block it.
                reply.meta.setdefault("within_24h", True)
                send_result = self.send(reply)

        return {
            "inbound": inbound,
            "reply": reply,
            "send_result": send_result,
            "handled": handler is not None,
        }

    # ── outbound ─────────────────────────────────────────────────────────────
    def send(self, msg: OutboundMessage, *, mark_idempotent: bool = True) -> SendResult:
        """Route an OutboundMessage to its adapter and send (dry-run by default).
        Idempotency-guarded: the same logical message won't double-send.

        `mark_idempotent=False` runs the full path (gate + adapter rules + preview)
        WITHOUT consuming the idempotency key — used by the dry-run/preview endpoint
        so repeated previews of the same message don't report a false 'duplicate'."""
        adapter = self.adapter_for(msg.channel)
        config = self.get_config(msg.tenant_id, msg.channel)
        idem = idempotency_key(msg)

        if mark_idempotent and self._store.already_sent(msg.tenant_id, idem):
            return SendResult(ok=True, channel=msg.channel, recipient_id=msg.recipient_id,
                              dry_run=True, sent=False, duplicate=True,
                              idempotency_key=idem, reason="duplicate_idempotency_key")

        # Optional compliance gate (consent / opt-out / rate-limit) before sending.
        if self._gate is not None:
            verdict = self._gate(msg, config, self._store)
            if not getattr(verdict, "allowed", True):
                blocked = SendResult(ok=False, channel=msg.channel, recipient_id=msg.recipient_id,
                                     dry_run=True, sent=False, idempotency_key=idem,
                                     reason=f"blocked:{verdict.blocked_by}")
                if mark_idempotent:
                    self._store.log_outbound(msg, blocked)
                return blocked

        result = adapter.send(msg, config)
        result.idempotency_key = idem
        if mark_idempotent:
            # Mark the logical message handled so a retry is flagged duplicate (in
            # live mode this also prevents double real-sends).
            self._store.mark_sent(msg.tenant_id, idem)
            self._store.log_outbound(msg, result)
        return result


_router: Optional[ChannelRouter] = None


def get_channel_router() -> ChannelRouter:
    """Process-wide router (adapters/handlers are registered onto it)."""
    global _router
    if _router is None:
        _router = ChannelRouter()
    return _router
