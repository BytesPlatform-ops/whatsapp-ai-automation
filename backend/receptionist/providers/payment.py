"""Stripe payment-link provider.

Configured (STRIPE_SECRET_KEY present) → creates a REAL Stripe Checkout Session
in payment mode and returns its shareable URL. Not configured → a pending result
(the payment request is still stored; the team can send a link manually). Never
returns a fake "paid" or a fabricated link.
"""

from __future__ import annotations

import os

from .base import Provider, ProviderResult

_STRIPE_API = "https://api.stripe.com/v1/checkout/sessions"


class PaymentProvider(Provider):
    capability = "payment_link"
    provider_name = "stripe"
    required_env = ["STRIPE_SECRET_KEY"]
    docs_hint = "Add STRIPE_SECRET_KEY to create real payment links via Stripe Checkout."

    def create_link(self, *, amount, currency: str = "USD", description: str = "",
                    customer_email: str = "") -> ProviderResult:
        if not self.is_configured():
            return self._disabled(
                "Stripe is not connected — payment request stored as pending. "
                "Add STRIPE_SECRET_KEY to generate a real payment link.")
        try:
            cents = int(round(float(amount) * 100))
        except (TypeError, ValueError):
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Invalid amount: {amount!r}")
        if cents <= 0:
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message="Amount must be greater than zero.")

        success_url = os.getenv("AI_RECEPTIONIST_PAYMENT_SUCCESS_URL",
                                "https://example.com/paid?session_id={CHECKOUT_SESSION_ID}")
        cancel_url = os.getenv("AI_RECEPTIONIST_PAYMENT_CANCEL_URL",
                               "https://example.com/cancelled")
        form = {
            "mode": "payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": currency.lower(),
            "line_items[0][price_data][unit_amount]": str(cents),
            "line_items[0][price_data][product_data][name]": (description or "Payment")[:250],
        }
        if customer_email:
            form["customer_email"] = customer_email
        try:
            import httpx

            with httpx.Client(timeout=20) as http:
                resp = http.post(
                    _STRIPE_API,
                    headers={"Authorization": f"Bearer {os.getenv('STRIPE_SECRET_KEY')}"},
                    data=form,
                )
            if resp.status_code >= 300:
                return ProviderResult(status="error", provider=self.provider_name,
                                      capability=self.capability, mode="real",
                                      message=f"Stripe error {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            return ProviderResult(
                status="success", provider=self.provider_name, capability=self.capability,
                mode="real", message="Real Stripe payment link created.",
                data={"payment_link": data.get("url"), "provider_ref": data.get("id"),
                      "amount": amount, "currency": currency},
            )
        except Exception as exc:  # never fake success
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Stripe request failed: {exc}")
