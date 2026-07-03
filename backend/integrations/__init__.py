"""Integrations — capability-based connector layer for agent execution.

Agents never call Gmail/Calendar directly. They name a *capability*
(email_send, calendar_create_event, lead_storage, follow_up); this layer resolves
it to a connector and runs it. The connector is a MOCK unless
runtime.real_execution_allowed() is True AND a live connection exists — otherwise
it stays mock (preview) or, in real mode with no connection, fails closed with a
clear "missing connection" message. Nothing here ever fakes real success.
"""

from .router import (
    CAPABILITIES,
    execute_action,
    integration_status,
    resolve_connector,
)

__all__ = [
    "CAPABILITIES",
    "execute_action",
    "integration_status",
    "resolve_connector",
]
