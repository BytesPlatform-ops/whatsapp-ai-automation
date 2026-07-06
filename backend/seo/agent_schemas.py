"""Schemas for the platform-aware SEO agent."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AuditStartBody(BaseModel):
    tenant_id: str = "demo_tenant"
    website_url: str = Field(..., min_length=3)
    crawl_limit: int = 1
    include_pagespeed: bool = False
    now: str = ""


class ConnectWordPressBody(BaseModel):
    tenant_id: str = "demo_tenant"
    site_url: str
    username: str
    application_password: str


class ConnectTokenBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = "demo_tenant"
    platform: str
    token: str = ""
    site_id: str = ""


class OptimizePrepareBody(BaseModel):
    tenant_id: str = "demo_tenant"
    audit_id: str
    issue_id: str
    new_value: str = ""       # optional override for the suggested fix
    now: str = ""
