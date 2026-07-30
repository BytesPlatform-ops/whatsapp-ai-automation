"""Hybrid knowledge retrieval (Wave 5, Part 10).

Hermetic + $0 (no embeddings). Proves structured-field / FAQ / knowledge retrieval,
stored evidence with source + chunk ids + method + score, exact-phrase boost,
bounded evidence, tenant isolation, and a weak-evidence refusal (no invented facts).
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _hermetic(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def _seed():
    from receptionist.service import config_repo
    config_repo.save("t_a", {
        "business_name": "Bright Dental", "hours": "Mon-Fri 8am to 6pm",
        "prices": "Cleaning is $90; whitening is $250",
        "cancellation_policy": "Cancellations need 24 hours notice",
    })


def test_structured_field_retrieval_with_evidence():
    _seed()
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_a", "what are your opening hours?")
    assert res["confident"] and res["outcome"] == "answer"
    ev = res["evidence"][0]
    assert "8am to 6pm" in ev["text"]
    assert ev["source_id"].startswith("profile:")
    assert ev["chunk_id"] and ev["method"] and ev["score"] >= 1.0


def test_price_retrieval():
    _seed()
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_a", "how much is whitening?")
    assert res["confident"]
    assert "250" in res["answer"]


def test_faq_and_knowledge_items_are_retrieved():
    from receptionist.service import business_profile, config_repo
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5",
                             "faqs": [{"q": "Do you offer parking?", "a": "Yes, free parking on site."}]})
    business_profile.create_knowledge("t_a", title="Warranty",
                                      content="All repairs carry a 12 month warranty.")
    from receptionist.service import knowledge
    r1 = knowledge.retrieve("t_a", "is there parking available?")
    assert r1["confident"] and "parking" in r1["answer"].lower()
    r2 = knowledge.retrieve("t_a", "how long is the warranty?")
    assert r2["confident"] and "12 month" in r2["answer"]


def test_weak_evidence_refuses():
    _seed()
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_a", "do you sell airplane tickets to mars?")
    assert not res["confident"] and res["outcome"] == "knowledge_gap"
    assert res["answer"] == ""


def test_evidence_is_bounded():
    from receptionist.service import business_profile, config_repo
    config_repo.save("t_a", {"business_name": "Acme", "hours": "9-5"})
    for i in range(10):
        business_profile.create_knowledge("t_a", title=f"Service {i}",
                                          content=f"service option number {i} available now")
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_a", "service available")
    assert len(res["evidence"]) <= knowledge.MAX_EVIDENCE_CHUNKS


def test_tenant_isolation():
    _seed()
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_b", "what are your hours?")
    assert not res["confident"] and res["outcome"] == "knowledge_gap"


def test_answer_question_contract_backcompat():
    _seed()
    from receptionist.service import business_profile
    ans = business_profile.answer_question("t_a", "what are your hours?")
    assert ans is not None
    assert set(("answer", "source", "ref", "score")).issubset(ans.keys())
    assert "evidence" in ans
