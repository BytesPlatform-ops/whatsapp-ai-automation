"""Meta integration — real Facebook Pages / Instagram / Ads via the Graph API.

Connection + asset discovery + insights + publishing connectors, plus the Meta
Marketing Agent. Reuses the existing integrations/approvals/activity/models
layers — this module only adds the Meta-specific pieces (OAuth, Graph calls,
seeded demo data). Tokens live server-side only, in the shared connections store.
"""
