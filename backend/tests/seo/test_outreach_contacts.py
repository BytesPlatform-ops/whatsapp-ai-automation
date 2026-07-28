"""Tests for seo.outreach.contacts: CRUD, CSV import/dedup, suppression."""

from __future__ import annotations

import pytest

import seo.outreach.stores as s
from seo.outreach import contacts as cont


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    s.reset_repositories()
    yield
    s.reset_repositories()


# ── add_contact ───────────────────────────────────────────────────────────────

def test_add_contact_basic():
    cid, c = cont.add_contact("t1", "example.com", email="alice@example.com", name="Alice")
    assert cid.startswith("oc_")
    assert c.email == "alice@example.com"
    assert c.name == "Alice"
    assert c.domain == "example.com"


def test_add_contact_normalises_email():
    cid, c = cont.add_contact("t1", "example.com", email="  ALICE@EXAMPLE.COM  ")
    assert c.email == "alice@example.com"


def test_add_contact_rejects_invalid_email():
    with pytest.raises(ValueError, match="invalid_email"):
        cont.add_contact("t1", "example.com", email="not-an-email")


def test_add_contact_suppressed_email_is_blocked():
    cont.suppress_email("t1", "blocked@example.com")
    with pytest.raises(ValueError, match="email_suppressed"):
        cont.add_contact("t1", "example.com", email="blocked@example.com")


def test_add_contact_no_email_allowed():
    cid, c = cont.add_contact("t1", "example.com", name="No Email Contact")
    assert c.email == ""


# ── suppression ───────────────────────────────────────────────────────────────

def test_suppress_email_is_idempotent():
    sid1, e1 = cont.suppress_email("t1", "x@y.com")
    sid2, e2 = cont.suppress_email("t1", "x@y.com")
    assert sid1 == sid2  # second call returns the existing entry


def test_suppress_email_blocks_add_contact():
    cont.suppress_email("t1", "blocked@test.com")
    assert cont.is_suppressed("t1", "blocked@test.com")
    assert not cont.is_suppressed("t2", "blocked@test.com")


def test_suppress_domain_blocks_any_email():
    cont.suppress_domain("t1", "badomain.com")
    assert cont.is_suppressed("t1", "anyone@badomain.com")
    assert not cont.is_suppressed("t1", "anyone@otherdomain.com")


# ── CSV import ────────────────────────────────────────────────────────────────

def test_csv_import_basic():
    csv_text = "domain,email,name\nexample.com,a@example.com,Alice\nexample.org,b@example.org,Bob\n"
    result = cont.import_contacts_csv("t1", csv_text)
    assert result["imported"] == 2
    assert result["skipped_dupe"] == 0
    contacts = cont.list_contacts("t1")
    assert len(contacts) == 2


def test_csv_import_dedup_by_email():
    # Add one contact first.
    cont.add_contact("t1", "example.com", email="a@example.com")
    # CSV includes the same email — should skip it.
    csv_text = "domain,email,name\nexample.com,a@example.com,Alice Dupe\nnewsite.com,b@newsite.com,Bob\n"
    result = cont.import_contacts_csv("t1", csv_text)
    assert result["imported"] == 1
    assert result["skipped_dupe"] == 1


def test_csv_import_skips_suppressed():
    cont.suppress_email("t1", "bad@bad.com")
    csv_text = "domain,email\nbad.com,bad@bad.com\ngood.com,good@good.com\n"
    result = cont.import_contacts_csv("t1", csv_text)
    assert result["skipped_suppressed"] == 1
    assert result["imported"] == 1


def test_csv_import_skips_invalid_emails():
    csv_text = "domain,email\nfoo.com,not-an-email\nbar.com,good@bar.com\n"
    result = cont.import_contacts_csv("t1", csv_text)
    assert result["skipped_invalid"] == 1
    assert result["imported"] == 1


def test_csv_import_without_header():
    # No header row — first column assumed to be domain.
    csv_text = "example.com\nother.org\n"
    result = cont.import_contacts_csv("t1", csv_text)
    assert result["imported"] == 2


def test_csv_import_empty_text():
    result = cont.import_contacts_csv("t1", "")
    assert result["imported"] == 0


# ── CSV export ────────────────────────────────────────────────────────────────

def test_csv_export_formula_injection_safe():
    cont.add_contact("t1", "=evil.com", name="=CMD|'/C calc'!A0")
    csv_text = cont.export_contacts_csv("t1")
    # Injected values must be prefixed with ' to neutralise.
    assert "=CMD" not in csv_text or "'=CMD" in csv_text
    # The domain = formula should be escaped too.
    lines = csv_text.strip().split("\n")
    data_lines = lines[1:]  # skip header
    for line in data_lines:
        assert not line.startswith("="), f"Unescaped formula in export: {line}"


def test_csv_export_excludes_do_not_contact():
    cont.add_contact("t1", "keep.com", email="keep@keep.com")
    cid, _ = cont.add_contact("t1", "dnc.com", email="dnc@dnc.com")
    cont.mark_do_not_contact("t1", cid)
    csv_text = cont.export_contacts_csv("t1")
    assert "dnc@dnc.com" not in csv_text
    assert "keep@keep.com" in csv_text
