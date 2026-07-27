"""Schemas for the platform-aware SEO agent.

``tenant_id`` is kept Optional with a ``"demo_tenant"`` default so existing
tests (which POST a body without an ``X-Pixie-Tenant`` header) continue to
work.  In production the ``resolve_tenant`` dependency in ``agent_routes.py``
overrides ``body.tenant_id`` with the header-derived value before the handler
uses it.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AuditStartBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    website_url: str = Field(..., min_length=3)
    crawl_limit: int = 1
    include_pagespeed: bool = False
    now: str = ""


class ConnectWordPressBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    site_url: str
    username: str
    application_password: str


class ConnectTokenBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    platform: str
    token: str = ""
    site_id: str = ""


class OptimizePrepareBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    audit_id: str
    issue_id: str
    new_value: str = ""       # optional override for the suggested fix
    now: str = ""
