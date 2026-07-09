"""Outbound event webhooks — notify a CRM/Zapier/Make/custom endpoint on
receptionist events (new lead, booking, quote, escalation, payment, ticket,
opt-out).

Configured (AI_RECEPTIONIST_WEBHOOK_URL) → POSTs a signed JSON payload. Not
configured → a no-op `disabled` result (not an error — webhooks are optional).
If AI_RECEPTIONIST_WEBHOOK_SECRET is set, the body is HMAC-SHA256 signed in the
`X-Pixie-Signature` header so the receiver can verify authenticity.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os

from .base import Provider, ProviderResult

EVENTS = ("lead.created", "booking.created", "quote.created", "escalation.created",
          "payment.created", "ticket.created", "optout.created")


class WebhookProvider(Provider):
    capability = "webhooks"
    provider_name = "webhook"
    required_env = ["AI_RECEPTIONIST_WEBHOOK_URL"]
    docs_hint = "Set AI_RECEPTIONIST_WEBHOOK_URL to forward receptionist events to your CRM/Zapier."

    def emit(self, *, event: str, payload: dict) -> ProviderResult:
        url = os.getenv("AI_RECEPTIONIST_WEBHOOK_URL", "").strip()
        if not url:
            return ProviderResult(status="disabled", provider=self.provider_name,
                                  capability=self.capability, mode="disabled",
                                  message="No webhook URL configured — event not forwarded.")
        body = json.dumps({"event": event, "data": payload}, default=str)
        headers = {"Content-Type": "application/json"}
        secret = os.getenv("AI_RECEPTIONIST_WEBHOOK_SECRET", "").strip()
        if secret:
            sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
            headers["X-Pixie-Signature"] = f"sha256={sig}"
        try:
            import httpx

            with httpx.Client(timeout=10) as http:
                resp = http.post(url, headers=headers, content=body)
            if resp.status_code >= 300:
                return ProviderResult(status="error", provider=self.provider_name,
                                      capability=self.capability, mode="real",
                                      message=f"Webhook returned {resp.status_code}.")
            return ProviderResult(status="success", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Event '{event}' forwarded to webhook.")
        except Exception as exc:
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Webhook request failed: {exc}")
