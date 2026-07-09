"""Team notification provider — email alerts for escalations, bookings, quotes,
support tickets, etc.

Order of preference:
  1. EMAIL_PROVIDER_API_KEY (+ AI_RECEPTIONIST_TEAM_EMAIL) → real Resend send.
  2. A connected Gmail account for the tenant (production + real) → reuse the
     existing `integrations.execute_action("email_send", ...)` connector.
  3. Otherwise → pending (the record still exists; nobody is emailed, no fake).
"""

from __future__ import annotations

import os

from .base import Provider, ProviderResult

_RESEND_API = "https://api.resend.com/emails"


class NotifyProvider(Provider):
    capability = "email_notify"
    provider_name = "resend"
    required_env = ["EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_TEAM_EMAIL"]
    docs_hint = ("Add EMAIL_PROVIDER_API_KEY + AI_RECEPTIONIST_TEAM_EMAIL to email the "
                 "team on escalations/bookings/quotes. A connected Gmail account also works.")

    def _resend(self, subject: str, body: str) -> ProviderResult:
        team = os.getenv("AI_RECEPTIONIST_TEAM_EMAIL", "")
        sender = os.getenv("AI_RECEPTIONIST_FROM_EMAIL") or "receptionist@pixie.local"
        try:
            import httpx

            with httpx.Client(timeout=20) as http:
                resp = http.post(
                    _RESEND_API,
                    headers={"Authorization": f"Bearer {os.getenv('EMAIL_PROVIDER_API_KEY')}",
                             "Content-Type": "application/json"},
                    json={"from": sender, "to": [team], "subject": subject,
                          "text": body},
                )
            if resp.status_code >= 300:
                return ProviderResult(status="error", provider=self.provider_name,
                                      capability=self.capability, mode="real",
                                      message=f"Email provider error {resp.status_code}: {resp.text[:200]}")
            return ProviderResult(status="success", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Team notified at {team}.")
        except Exception as exc:
            return ProviderResult(status="error", provider=self.provider_name,
                                  capability=self.capability, mode="real",
                                  message=f"Email provider request failed: {exc}")

    def notify_team(self, *, tenant_id: str = "", subject: str, body: str,
                    event: str = "") -> ProviderResult:
        # 1) Dedicated email provider.
        if self.is_configured():
            return self._resend(subject, body)

        # 2) Fall back to a connected Gmail for this tenant (goes real only in
        #    production+real+connected; mock otherwise).
        team = os.getenv("AI_RECEPTIONIST_TEAM_EMAIL", "")
        if tenant_id and team:
            try:
                from integrations import execute_action
                from integrations.connections import find_active_connection

                if find_active_connection(tenant_id, "email_send"):
                    res = execute_action(tenant_id, "email_send",
                                         {"to": team, "subject": subject, "body": body})
                    ok = res.get("status") == "success"
                    return ProviderResult(
                        status="success" if ok else "pending",
                        provider=res.get("provider", "gmail"), capability=self.capability,
                        mode=res.get("mode", "mock"),
                        message=res.get("message", ""), data=res)
            except Exception:
                pass

        # 3) Honest pending — record exists, nobody emailed.
        return self._disabled("No email provider or Gmail connected — team alert not sent "
                              "(record saved; connect email to enable alerts).")
