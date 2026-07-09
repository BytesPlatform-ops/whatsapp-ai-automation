"""Voice / callback provider (Twilio Voice).

Placing a real outbound call needs a TwiML webhook the deployment hasn't wired
yet, so `request_callback` always parks the request as a callback task and
returns `pending` — it never claims a call was placed. `status()` still reports
whether the Twilio voice credentials are present, so the abstraction is "ready"
the moment the call loop is configured.
"""

from __future__ import annotations

from .base import Provider, ProviderResult


class VoiceProvider(Provider):
    capability = "voice"
    provider_name = "twilio_voice"
    required_env = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]
    docs_hint = ("Add Twilio voice credentials to enable programmable callbacks. "
                 "Outbound dialing also requires a TwiML webhook URL.")

    def request_callback(self, *, to: str, reason: str = "",
                         preferred_time: str = "") -> ProviderResult:
        if not self.is_configured():
            return self._disabled("Voice provider not connected — callback logged for the team.")
        # Credentials present, but automated dialing needs a TwiML endpoint we
        # don't host yet — be honest: queue it, don't claim a call happened.
        return ProviderResult(
            status="pending", provider=self.provider_name, capability=self.capability,
            mode="real",
            message="Callback queued. Automated dialing requires a TwiML webhook; "
                    "the team will place the call.",
            data={"to": to, "reason": reason, "preferred_time": preferred_time},
        )
