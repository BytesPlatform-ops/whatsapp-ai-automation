"""Provider abstractions for the AI Receptionist's newer channels/integrations.

Gmail + Google Calendar already have real connectors in `integrations/` (reuse
those via `integrations.execute_action`). This package adds the ones the backend
was missing — payment (Stripe), SMS + WhatsApp + voice (Twilio), team email
notifications (Resend/EMAIL_PROVIDER), and outbound event webhooks — behind a
common `Provider` contract.

Golden rule (same as `integrations/connectors.py`): a provider NEVER fakes a
successful real side effect. Missing credentials → a `pending`/`disabled` result
and a clear status, not a lie. `all_status()` powers the Integration panel.
"""

from __future__ import annotations

from typing import Optional

from .base import Provider, ProviderResult
from .payment import PaymentProvider
from .sms import SmsProvider, WhatsAppProvider
from .voice import VoiceProvider
from .notify import NotifyProvider
from .webhooks import WebhookProvider

payment = PaymentProvider()
sms = SmsProvider()
whatsapp = WhatsAppProvider()
voice = VoiceProvider()
notify = NotifyProvider()
webhooks = WebhookProvider()

_PROVIDERS: dict[str, Provider] = {
    payment.capability: payment,
    sms.capability: sms,
    whatsapp.capability: whatsapp,
    voice.capability: voice,
    notify.capability: notify,
    webhooks.capability: webhooks,
}

RECEPTIONIST_CAPABILITIES = list(_PROVIDERS.keys())


def get_provider(capability: str) -> Optional[Provider]:
    return _PROVIDERS.get(capability)


def all_status() -> list[dict]:
    """Connection status for every receptionist provider (for the dashboard)."""
    return [p.status() for p in _PROVIDERS.values()]


# ── convenience wrappers used by handlers ─────────────────────────────────────

def create_payment_link(*, amount, currency: str = "USD", description: str = "",
                        customer_email: str = "") -> ProviderResult:
    return payment.create_link(amount=amount, currency=currency,
                               description=description, customer_email=customer_email)


def send_sms(*, to: str, body: str) -> ProviderResult:
    return sms.send(to=to, body=body)


def send_whatsapp(*, to: str, body: str) -> ProviderResult:
    return whatsapp.send(to=to, body=body)


def request_callback(*, to: str, reason: str = "", preferred_time: str = "") -> ProviderResult:
    return voice.request_callback(to=to, reason=reason, preferred_time=preferred_time)


def notify_team(*, tenant_id: str = "", subject: str, body: str,
                event: str = "") -> ProviderResult:
    return notify.notify_team(tenant_id=tenant_id, subject=subject, body=body, event=event)


def emit_webhook(*, event: str, payload: dict) -> ProviderResult:
    return webhooks.emit(event=event, payload=payload)
