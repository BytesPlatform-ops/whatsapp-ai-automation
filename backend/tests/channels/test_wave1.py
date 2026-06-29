"""Wave 1 smoke — the Channels foundation runs end-to-end with NO API keys.

Proves: one normalized interface; a service registers a handler and replies
without knowing the channel; inbound→router→handler→outbound→send is dry-run by
default; per-channel requirement validation; idempotency; tenant isolation; and
the owner PixieContact + token-vault masking. All $0, no network.
"""

from __future__ import annotations

from channels import (
    Channel,
    ChannelConfig,
    ChannelMode,
    InboundMessage,
    OutboundMessage,
    PixieContact,
)
from channels.crypto import get_vault, mask
from channels.router import ChannelRouter
from channels.schemas import PixieContactType
from channels.store import InMemoryChannelStore


def _router() -> ChannelRouter:
    """A router with its OWN store, so tests are hermetic regardless of order."""
    return ChannelRouter(store=InMemoryChannelStore())


def _echo_handler(inb: InboundMessage):
    """A service handler — receives a normalized InboundMessage, replies WITHOUT
    knowing the channel."""
    return OutboundMessage(
        tenant_id=inb.tenant_id,
        channel=inb.channel,
        recipient_id=inb.sender_id,
        thread_id=inb.thread_id,
        text=f"Echo: {inb.text}",
    )


def test_inbound_to_outbound_round_trip_dry_run():
    router = _router()
    router.register_handler("receptionist", _echo_handler)

    out = router.route_inbound(Channel.WEB_CHAT, "t_a",
                               {"sender": "u1", "message": "hi there", "thread": "c1"})
    assert out["handled"] is True
    inb = out["inbound"]
    assert isinstance(inb, InboundMessage) and inb.text == "hi there" and inb.sender_id == "u1"
    sr = out["send_result"]
    assert sr is not None
    assert sr.dry_run is True and sr.sent is False          # nothing leaves the box
    assert sr.preview["text"] == "Echo: hi there"
    assert sr.preview["to"] == "u1"


def test_normalized_interface_is_channel_agnostic():
    router = _router()
    router.register_handler("svc", _echo_handler)
    # Same handler, different channels, different raw shapes — all normalize.
    for ch, raw in [
        (Channel.TELEGRAM, {"chat_id": "42", "text": "hello"}),
        (Channel.SMS, {"from": "+100", "body": "yo"}),
        (Channel.EMAIL, {"sender": "a@x.com", "content": "hey"}),
    ]:
        out = router.route_inbound(ch, "t_a", raw)
        assert out["send_result"].channel == ch
        assert out["send_result"].preview["text"].startswith("Echo:")


def test_sms_truncates_to_160():
    router = _router()
    long = "x" * 500
    sr = router.send(OutboundMessage(tenant_id="t_a", channel=Channel.SMS, recipient_id="+1", text=long))
    assert len(sr.preview["text"]) == 160


def test_per_channel_requirements_gate_go_live():
    router = _router()
    # web_chat: just needs a widget id → met once provided.
    st = router.status("t_a", Channel.WEB_CHAT)
    assert st.requirements_met is False and "Site/widget connected" in st.missing
    router.save_config(ChannelConfig(tenant_id="t_a", channel=Channel.WEB_CHAT,
                                     enabled=True, mode=ChannelMode.LIVE,
                                     settings={"widget_id": "w_123"}))
    st2 = router.status("t_a", Channel.WEB_CHAT)
    assert st2.requirements_met is True and st2.missing == [] and st2.live is True

    # whatsapp: many requirements → not met by default, listed in missing.
    wa = router.status("t_a", Channel.WHATSAPP)
    assert wa.requirements_met is False
    assert any("template" in m.lower() for m in wa.missing)
    assert wa.live is False


def test_idempotency_blocks_double_send():
    router = _router()
    msg = OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT, recipient_id="u1",
                          text="confirm", idempotency_key="abc123")
    first = router.send(msg)
    second = router.send(msg)
    assert first.duplicate is False
    assert second.duplicate is True and second.reason == "duplicate_idempotency_key"


def test_tenant_isolation_on_config():
    router = _router()
    router.save_config(ChannelConfig(tenant_id="t_a", channel=Channel.TELEGRAM, enabled=True))
    # t_b sees its own (default, disabled) config — never t_a's.
    assert router.get_config("t_b", Channel.TELEGRAM).enabled is False
    assert router.get_config("t_a", Channel.TELEGRAM).enabled is True


def test_pixie_contact_and_vault_masking():
    vault = get_vault()
    ref = vault.put("t_a", "owner_email", "owner@biz.com")
    assert vault.get(ref) == "owner@biz.com"
    assert "owner@biz.com" not in repr(vault)         # secrets never in repr/logs
    contact = PixieContact(tenant_id="t_a", type=PixieContactType.EMAIL, value_ref=ref,
                           value_masked=mask("owner@biz.com"), preferred_channel=Channel.EMAIL,
                           notify_on=["new_lead", "daily_summary"])
    assert contact.value_masked == "o***@biz.com"
    assert "new_lead" in contact.notify_on


def test_all_status_covers_every_channel():
    router = _router()
    statuses = router.all_status("t_a")
    assert {s.channel for s in statuses} == set(Channel)
    # nothing is live by default — safe out of the box
    assert all(s.live is False for s in statuses)
