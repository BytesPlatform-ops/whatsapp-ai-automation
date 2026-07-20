"""BYOK credential storage — sealing, durability, tenant isolation, no plaintext.

Fernet's real ``cryptography`` backend may be absent in CI, so the sealed-at-rest
path is exercised with a reversible fake sealer (monkeypatched ``_seal``/``_unseal``)
that still proves the invariant that matters: only the SEALED blob is persisted —
the raw secret substring never lands in the store — and durable mode refuses to
write an UNSEALED secret.

Run: .venv/bin/python -m pytest tests/content_creator/test_credentials_durable.py -q
"""

from __future__ import annotations

import pytest

import persistence
from content_creator.providers import credentials as cred

SECRET = "hfkey1234:supersecretvalue"


@pytest.fixture(autouse=True)
def _clean():
    cred._CREDENTIALS.clear()
    yield
    cred._CREDENTIALS.clear()


# ---------------------------------------------------------------------------
# In-memory mode (dev/test): round-trip + isolation + no leak
# ---------------------------------------------------------------------------
def test_memory_roundtrip_and_isolation(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    cred.set_credential("ws_A", SECRET)
    assert cred.get_tenant_credential("ws_A") == SECRET
    assert cred.has_tenant_credential("ws_A") is True
    # cross-tenant: another workspace sees nothing
    assert cred.get_tenant_credential("ws_B") == ""
    assert cred.has_tenant_credential("ws_B") is False
    cred.clear_credential("ws_A")
    assert cred.has_tenant_credential("ws_A") is False


def test_masked_hint_never_leaks_secret():
    hint = cred.masked_hint(SECRET)
    assert hint.startswith("hf_")
    assert "supersecret" not in hint
    assert "supersecretvalue" not in hint
    assert cred.masked_hint("") == ""


# ---------------------------------------------------------------------------
# Durable mode WITHOUT encryption → refuse to persist plaintext
# ---------------------------------------------------------------------------
def test_durable_without_encryption_refuses(monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("CONTENT_CREATOR_SECRET_KEY", raising=False)
    assert persistence.enabled() is True
    with pytest.raises(cred.CredentialEncryptionRequired):
        cred.set_credential("ws_A", SECRET)
    # nothing was persisted
    assert persistence.table("cc_credentials").get("ws_A", cred._cred_id("ws_A")) is None
    assert cred.has_tenant_credential("ws_A") is False


# ---------------------------------------------------------------------------
# Durable mode WITH sealing → only the sealed blob is stored; survives restart
# ---------------------------------------------------------------------------
def test_durable_persists_sealed_only(monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    # reversible fake sealer (no cryptography needed) — reverse hides the substring
    monkeypatch.setattr(cred, "_seal", lambda raw: "enc:" + raw[::-1] if raw else raw)
    monkeypatch.setattr(cred, "_unseal", lambda s: s[4:][::-1] if s.startswith("enc:") else s)

    cred.set_credential("ws_A", SECRET)

    # the persisted row holds ONLY the sealed value — raw secret substring absent
    row = persistence.table("cc_credentials").get("ws_A", cred._cred_id("ws_A"))
    assert row is not None
    sealed = row["data"]["sealed"]
    assert sealed.startswith("enc:")
    assert "supersecretvalue" not in sealed

    # internal use gets the real secret back (simulate restart: fresh repo/table)
    assert cred.get_tenant_credential("ws_A") == SECRET
    # tenant isolation at the durable layer
    assert cred.get_tenant_credential("ws_B") == ""
    cred.clear_credential("ws_A")
    assert cred.has_tenant_credential("ws_A") is False
