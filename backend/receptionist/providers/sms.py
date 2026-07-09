"""Twilio SMS + WhatsApp providers.

Configured → real Twilio Messages API send. Not configured → pending (message
parked). Shares the Twilio account/token; SMS uses TWILIO_PHONE_NUMBER, WhatsApp
uses TWILIO_WHATSAPP_FROM (with the `whatsapp:` channel prefix).
"""

from __future__ import annotations

import os

from .base import Provider, ProviderResult


def _twilio_send(account_sid: str, auth_token: str, from_: str, to: str, body: str,
                 provider: str, capability: str) -> ProviderResult:
    try:
        import httpx

        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        with httpx.Client(timeout=20) as http:
            resp = http.post(url, auth=(account_sid, auth_token),
                             data={"From": from_, "To": to, "Body": body})
        if resp.status_code >= 300:
            return ProviderResult(status="error", provider=provider, capability=capability,
                                  mode="real", message=f"Twilio error {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        return ProviderResult(status="success", provider=provider, capability=capability,
                              mode="real", message=f"Real message sent to {to}.",
                              data={"sid": data.get("sid"), "to": to})
    except Exception as exc:
        return ProviderResult(status="error", provider=provider, capability=capability,
                              mode="real", message=f"Twilio request failed: {exc}")


class SmsProvider(Provider):
    capability = "sms"
    provider_name = "twilio"
    required_env = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]
    docs_hint = "Add Twilio SID/token and TWILIO_PHONE_NUMBER to send real SMS."

    def send(self, *, to: str, body: str) -> ProviderResult:
        if not to:
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, message="No recipient number.")
        if not self.is_configured():
            return self._disabled("SMS provider not connected — message parked for the team.")
        return _twilio_send(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"),
                            os.getenv("TWILIO_PHONE_NUMBER"), to, body,
                            self.provider_name, self.capability)


class WhatsAppProvider(Provider):
    capability = "whatsapp"
    provider_name = "twilio_whatsapp"
    required_env = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]
    docs_hint = "Add Twilio SID/token and TWILIO_WHATSAPP_FROM to send real WhatsApp messages."

    def send(self, *, to: str, body: str) -> ProviderResult:
        if not to:
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, message="No recipient number.")
        if not self.is_configured():
            return self._disabled("WhatsApp provider not connected — message parked for the team.")
        frm = os.getenv("TWILIO_WHATSAPP_FROM", "")
        if not frm.startswith("whatsapp:"):
            frm = f"whatsapp:{frm}"
        dest = to if to.startswith("whatsapp:") else f"whatsapp:{to}"
        return _twilio_send(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"),
                            frm, dest, body, self.provider_name, self.capability)
