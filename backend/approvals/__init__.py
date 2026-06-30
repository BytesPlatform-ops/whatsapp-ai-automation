"""Pixie Lab approvals — the gate for risky actions (publish, post, send, charge).

A risky feed/agent action creates a pending ApprovalItem instead of executing;
the user approves or rejects it explicitly. Safe actions never come here.
In-memory seam; mirrors the ApprovalItem Prisma shape.
"""
