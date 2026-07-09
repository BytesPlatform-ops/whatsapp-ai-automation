"""Provider contract + result shape.

Env-gated: `required_env` lists the keys a provider needs to go real. With them
present the provider performs the real call; without them it returns a
`pending`/`disabled` result and `status()` reports exactly which keys are
missing — the frontend Integration panel renders that verbatim. No secret value
is ever returned by `status()` (presence booleans only).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class ProviderResult:
    status: str                 # success | pending | disabled | error | blocked
    provider: str
    capability: str = ""
    mode: str = "mock"          # real | mock | disabled
    message: str = ""
    data: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status == "success"

    def to_dict(self) -> dict:
        return {
            "status": self.status, "provider": self.provider,
            "capability": self.capability, "mode": self.mode,
            "message": self.message, **({"data": self.data} if self.data else {}),
        }


class Provider:
    capability: str = ""
    provider_name: str = ""
    required_env: list[str] = []
    docs_hint: str = ""

    def env_present(self) -> bool:
        return all(os.getenv(k) for k in self.required_env)

    def missing_env(self) -> list[str]:
        return [k for k in self.required_env if not os.getenv(k)]

    def is_configured(self) -> bool:
        return self.env_present()

    def status(self) -> dict:
        configured = self.is_configured()
        return {
            "capability": self.capability,
            "provider": self.provider_name,
            "connected": configured,
            "status": "connected" if configured else "missing_env",
            "mode": "real" if configured else "disabled",
            "required_env": list(self.required_env),
            "missing_env": self.missing_env(),
            "note": "" if configured else (self.docs_hint or
                    f"Set {', '.join(self.required_env)} to enable {self.capability}."),
        }

    # helpers for concrete providers
    def _disabled(self, message: str = "") -> ProviderResult:
        return ProviderResult(
            status="pending", provider=self.provider_name, capability=self.capability,
            mode="disabled",
            message=message or (f"{self.provider_name} is not configured "
                                f"(missing {', '.join(self.missing_env())}). "
                                "Record parked for the team."),
        )
