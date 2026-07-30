"""Dependency-injected mock CRM transport (Part 43). Hermetic — no network.

Parameterised per provider so each adapter's mock returns provider-flavoured
fixtures (distinct object names/fields), proving the adapters are genuinely
replaceable behind one interface. Standard tests use these mocks; live transports
are NOT wired in this phase.
"""

from __future__ import annotations

from .base import CRMTransport


class MockCRMTransport(CRMTransport):
    def __init__(self, provider: str, *, capabilities=None, account_name="Acme CRM",
                 rate_limited: bool = False):
        self.provider = provider
        self.capabilities = capabilities or []
        self.account_name = account_name
        self.rate_limited = rate_limited
        self.writes = 0

    def get_account(self, creds):
        return {"id": f"{self.provider}_acct_1", "name": self.account_name}

    def discover_capabilities(self, creds):
        return {"capabilities": self.capabilities}

    def list_objects(self, creds, object_type, cursor):
        # two fixture pages for deterministic pagination tests
        if cursor in ("", None):
            return {"data": [self._fixture(object_type, 1), self._fixture(object_type, 2)],
                    "next_cursor": "page2", "has_more": True}
        return {"data": [self._fixture(object_type, 3)], "next_cursor": "", "has_more": False}

    def get_object(self, creds, object_type, record_id):
        return self._fixture(object_type, 1, record_id=record_id)

    def create_object(self, creds, object_type, payload):
        self.writes += 1
        return {"id": f"{self.provider}_{object_type}_new{self.writes}", "version": "v1", **payload}

    def update_object(self, creds, object_type, record_id, payload):
        self.writes += 1
        return {"id": record_id, "version": f"v{self.writes + 1}", **payload}

    def list_custom_fields(self, creds, object_type):
        return {"data": [{"id": f"{self.provider}_cf_1", "name": "lead_source", "type": "single_select"},
                         {"id": f"{self.provider}_cf_2", "name": "budget", "type": "number"}]}

    def list_pipelines(self, creds):
        return {"data": [{"id": f"{self.provider}_pl_1", "name": "Sales",
                          "stages": [{"id": "s_new", "name": "New"}, {"id": "s_won", "name": "Won"}]}]}

    def fetch_changes(self, creds, cursor):
        if cursor == "stale":  # bounded recovery path
            return {"data": [], "next_cursor": "recovered", "has_more": False}
        return {"data": [self._fixture("contact", 9, record_id=f"{self.provider}_chg_1")],
                "next_cursor": "cur_next", "has_more": False}

    def register_webhook(self, creds, url, secret):
        return {"ok": True, "id": f"{self.provider}_wh_1"}

    def _fixture(self, object_type, n, record_id=None):
        rid = record_id or f"{self.provider}_{object_type}_{n}"
        base = {"id": rid, "version": f"v{n}", "updated_at": f"2026-09-0{n}T10:00:00Z",
                "created_at": "2026-09-01T09:00:00Z", "owner_id": f"{self.provider}_owner_1",
                "custom_fields": {"lead_source": "web"}}
        if object_type in ("contact", "lead"):
            base.update({"first_name": f"Sam{n}", "last_name": "Jones", "email": f"sam{n}@example.com",
                         "phone": f"+1555000{n:04d}", "company": "Acme", "source": "crm"})
        elif object_type == "company":
            base.update({"name": f"Acme {n} Ltd"})
        elif object_type == "deal":
            base.update({"name": f"Deal {n}", "value": 1000 * n, "currency": "USD",
                         "pipeline_id": f"{self.provider}_pl_1", "stage_id": "s_new", "status": "open"})
        elif object_type == "task":
            base.update({"title": f"Follow up {n}", "status": "open", "due_date": "2026-09-10"})
        elif object_type == "note":
            base.update({"body": f"Note {n}"})
        return base
