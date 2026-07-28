"""Tests for the keyword-intelligence vertical.

Covers:
  - Project CRUD (create/list/get/update/archive)
  - Keyword add/bulk/dedup
  - CSV import/export + formula-injection escaping
  - Provider normalisation (unavailable metrics stay None, never fabricated)
  - Research cache (second identical call does not re-hit provider)
  - Filters (volume, difficulty, intent, length, include/exclude words)
  - Clustering determinism (same input -> same clusters)
  - Intent classification (representative keywords)
  - Target-page assignment
  - Cross-tenant isolation (tenant B cannot see tenant A project/keywords)
  - Limit check path

All tests are ZERO paid/network calls: the MockKeywordProvider is always used
because DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD / KEYWORD_API_KEY are unset.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import patch

import pytest

# Ensure backend/ is on the path.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Clear live creds so the factory always returns the mock.
for _k in ("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "KEYWORD_API_KEY"):
    os.environ.pop(_k, None)


from seo.search_stores import (
    SearchIntent,
    TrackingStatus,
    reset_repositories,
)
from seo.keywords.projects import (
    create_project,
    list_projects,
    get_project,
    update_project,
    archive_project,
    unarchive_project,
)
from seo.keywords.keyword_service import (
    add_keyword,
    bulk_add_keywords,
    list_keywords,
    get_keyword,
    update_keyword,
    delete_keyword,
    set_tracking_status,
    assign_target_page,
)
from seo.keywords.csv_io import import_csv, export_csv, _escape_cell
from seo.keywords.research_service import research, clear_research_cache, add_selected_to_project
from seo.keywords.clustering import (
    classify_intent,
    classify_intents_batch,
    cluster_keywords_deterministic,
    auto_cluster_project,
    list_clusters,
    rename_cluster,
    assign_target_url,
    merge_clusters,
    split_cluster,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    """Reset in-memory repos between tests + clear the research cache."""
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    reset_repositories()
    clear_research_cache()
    yield
    reset_repositories()
    clear_research_cache()


# ── Project CRUD ──────────────────────────────────────────────────────────────

class TestProjectCRUD:
    def test_create_returns_project(self):
        result = create_project("tenant_a", name="My Project")
        assert "project" in result
        p = result["project"]
        assert p["name"] == "My Project"
        assert p["tenant_id"] == "tenant_a"
        assert p["archived"] is False
        assert p["id"].startswith("kwproj_")

    def test_list_returns_only_own_tenant(self):
        create_project("tenant_a", name="A1")
        create_project("tenant_b", name="B1")
        a_projects = list_projects("tenant_a")["projects"]
        b_projects = list_projects("tenant_b")["projects"]
        assert len(a_projects) == 1
        assert a_projects[0]["name"] == "A1"
        assert len(b_projects) == 1
        assert b_projects[0]["name"] == "B1"

    def test_get_existing(self):
        pid = create_project("tenant_a", name="Foo")["project"]["id"]
        result = get_project("tenant_a", pid)
        assert result["project"]["id"] == pid

    def test_get_wrong_tenant_returns_empty(self):
        pid = create_project("tenant_a", name="Foo")["project"]["id"]
        result = get_project("tenant_b", pid)
        assert result == {}

    def test_get_nonexistent_returns_empty(self):
        assert get_project("tenant_a", "kwproj_does_not_exist") == {}

    def test_update_name(self):
        pid = create_project("tenant_a", name="Old Name")["project"]["id"]
        result = update_project("tenant_a", pid, name="New Name")
        assert result["project"]["name"] == "New Name"

    def test_update_competitors(self):
        pid = create_project("tenant_a", name="Proj")["project"]["id"]
        result = update_project("tenant_a", pid, competitors=["example.com", "rival.com"])
        assert result["project"]["competitors"] == ["example.com", "rival.com"]

    def test_archive_soft_delete(self):
        pid = create_project("tenant_a", name="Proj")["project"]["id"]
        archive_project("tenant_a", pid)
        # Default listing hides archived.
        active = list_projects("tenant_a")["projects"]
        assert not any(p["id"] == pid for p in active)
        # With flag, shows up.
        all_p = list_projects("tenant_a", include_archived=True)["projects"]
        assert any(p["id"] == pid and p["archived"] for p in all_p)

    def test_unarchive_restores(self):
        pid = create_project("tenant_a", name="Proj")["project"]["id"]
        archive_project("tenant_a", pid)
        unarchive_project("tenant_a", pid)
        active = list_projects("tenant_a")["projects"]
        assert any(p["id"] == pid and not p["archived"] for p in active)


# ── Keyword CRUD ──────────────────────────────────────────────────────────────

class TestKeywordCRUD:
    def _proj(self, tenant="tenant_a"):
        return create_project(tenant, name="Test Project")["project"]["id"]

    def test_add_single_keyword(self):
        pid = self._proj()
        result = add_keyword("tenant_a", pid, "plumber london")
        assert result["added"] is True
        kw = result["keyword"]
        assert kw["keyword"] == "plumber london"
        assert kw["normalized_keyword"] == "plumber london"
        assert kw["id"].startswith("kw_")

    def test_add_stores_metrics(self):
        pid = self._proj()
        result = add_keyword(
            "tenant_a", pid, "hvac repair",
            search_volume=1200, cpc=3.5, difficulty=45,
            data_provider="mock", data_timestamp="2026-01-01T00:00:00"
        )
        kw = result["keyword"]
        assert kw["search_volume"] == 1200
        assert kw["cpc"] == 3.5
        assert kw["difficulty"] == 45
        assert kw["data_provider"] == "mock"

    def test_duplicate_detection_within_project(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "Roofing Services")
        result = add_keyword("tenant_a", pid, "roofing services")  # same normalized
        assert result["added"] is False
        assert result["reason"] == "duplicate"

    def test_duplicate_different_projects(self):
        pid1 = self._proj()
        pid2 = create_project("tenant_a", name="Proj2")["project"]["id"]
        add_keyword("tenant_a", pid1, "plumber")
        result = add_keyword("tenant_a", pid2, "plumber")
        assert result["added"] is True  # different project -> no dupe

    def test_empty_keyword_rejected(self):
        pid = self._proj()
        result = add_keyword("tenant_a", pid, "   ")
        assert result["added"] is False
        assert result["reason"] == "empty_keyword"

    def test_bulk_add_splits_newline(self):
        pid = self._proj()
        result = bulk_add_keywords("tenant_a", pid, "keyword one\nkeyword two\nkeyword three")
        assert result["added_count"] == 3
        assert len(result["keywords"]) == 3

    def test_bulk_add_splits_comma(self):
        pid = self._proj()
        result = bulk_add_keywords("tenant_a", pid, "alpha, beta, gamma")
        assert result["added_count"] == 3

    def test_bulk_dedup_within_paste(self):
        pid = self._proj()
        result = bulk_add_keywords("tenant_a", pid, "abc\nabc\nABC")
        assert result["added_count"] == 1
        assert result["skipped_duplicates"] == 2

    def test_list_keywords_all(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "apple")
        add_keyword("tenant_a", pid, "banana")
        result = list_keywords("tenant_a", pid)
        assert result["total"] == 2

    def test_list_filter_by_intent(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "kw_info", intent="informational")
        add_keyword("tenant_a", pid, "kw_comm", intent="commercial")
        info = list_keywords("tenant_a", pid, intent="informational")
        assert all(k["intent"] == "informational" for k in info["keywords"])
        assert info["total"] == 1

    def test_list_filter_by_tracking_status(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "tracked_kw", tracking_status="tracked")
        add_keyword("tenant_a", pid, "untracked_kw", tracking_status="untracked")
        tracked = list_keywords("tenant_a", pid, tracking_status="tracked")
        assert tracked["total"] == 1

    def test_list_filter_by_tag(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "tagged", tags=["priority"])
        add_keyword("tenant_a", pid, "untagged")
        filtered = list_keywords("tenant_a", pid, tag="priority")
        assert filtered["total"] == 1

    def test_list_filter_by_search(self):
        pid = self._proj()
        add_keyword("tenant_a", pid, "best plumber london")
        add_keyword("tenant_a", pid, "emergency electrician")
        result = list_keywords("tenant_a", pid, search="plumber")
        assert result["total"] == 1

    def test_get_keyword_existing(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "foo bar")["keyword"]["id"]
        result = get_keyword("tenant_a", kid)
        assert result["keyword"]["id"] == kid

    def test_get_keyword_wrong_tenant(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "foo bar")["keyword"]["id"]
        assert get_keyword("tenant_b", kid) == {}

    def test_update_keyword_tags(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "test kw")["keyword"]["id"]
        result = update_keyword("tenant_a", kid, tags=["seo", "priority"])
        assert result["keyword"]["tags"] == ["seo", "priority"]

    def test_update_keyword_target_page(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "test kw")["keyword"]["id"]
        result = assign_target_page("tenant_a", kid, "/about")
        assert result["keyword"]["target_page"] == "/about"

    def test_delete_keyword(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "to delete")["keyword"]["id"]
        assert delete_keyword("tenant_a", kid)["deleted"] is True
        assert get_keyword("tenant_a", kid) == {}

    def test_set_tracking_status(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "track me")["keyword"]["id"]
        result = set_tracking_status("tenant_a", kid, "tracked")
        assert result["keyword"]["tracking_status"] == "tracked"

    def test_set_invalid_tracking_status(self):
        pid = self._proj()
        kid = add_keyword("tenant_a", pid, "test kw")["keyword"]["id"]
        result = set_tracking_status("tenant_a", kid, "bogus")
        assert "error" in result


# ── CSV import/export ─────────────────────────────────────────────────────────

class TestCsvIo:
    def test_import_with_header(self):
        csv_text = "keyword,search_volume,difficulty\nplumber,1200,45\nhvac repair,800,60"
        rows = import_csv(csv_text)
        assert len(rows) == 2
        assert rows[0]["keyword"] == "plumber"
        assert rows[0]["search_volume"] == 1200
        assert rows[0]["difficulty"] == 45

    def test_import_no_header_assumes_first_col_keyword(self):
        rows = import_csv("roofing services\nhvac repair")
        assert len(rows) == 2
        assert rows[0]["keyword"] == "roofing services"

    def test_import_volume_alias(self):
        csv_text = "keyword,volume\ntest,500"
        rows = import_csv(csv_text)
        assert rows[0]["search_volume"] == 500

    def test_import_tags_split_pipe(self):
        csv_text = "keyword,tags\ntest kw,seo|priority"
        rows = import_csv(csv_text)
        assert rows[0]["tags"] == ["seo", "priority"]

    def test_import_tags_split_semicolon(self):
        csv_text = "keyword,tags\ntest kw,seo;local"
        rows = import_csv(csv_text)
        assert rows[0]["tags"] == ["seo", "local"]

    def test_import_skips_empty_keyword_rows(self):
        csv_text = "keyword\n\nplumber\n  "
        rows = import_csv(csv_text)
        assert len(rows) == 1

    def test_import_empty_text(self):
        assert import_csv("") == []
        assert import_csv(None) == []

    def test_export_produces_header(self):
        csv_text = export_csv([{"keyword": "test", "search_volume": 100}])
        assert csv_text.startswith("keyword,")
        assert "test" in csv_text

    def test_export_empty_list(self):
        csv_text = export_csv([])
        lines = [l for l in csv_text.strip().splitlines() if l]
        assert len(lines) == 1  # header only

    def test_export_formula_injection_equals(self):
        row = {"keyword": "=SUM(A1:A10)", "search_volume": None}
        csv_text = export_csv([row])
        assert "'=SUM(A1:A10)" in csv_text

    def test_export_formula_injection_plus(self):
        row = {"keyword": "+dangerous", "search_volume": None}
        csv_text = export_csv([row])
        assert "'+dangerous" in csv_text

    def test_export_formula_injection_at(self):
        row = {"keyword": "@formula", "search_volume": None}
        csv_text = export_csv([row])
        assert "'@formula" in csv_text

    def test_export_formula_injection_minus(self):
        row = {"keyword": "-1+2", "search_volume": None}
        csv_text = export_csv([row])
        assert "'-1+2" in csv_text

    def test_export_formula_injection_tab(self):
        assert _escape_cell("\tBAD") == "'\tBAD"

    def test_export_formula_injection_cr(self):
        assert _escape_cell("\rBAD") == "'\rBAD"

    def test_export_safe_values_not_prefixed(self):
        assert _escape_cell("normal keyword") == "normal keyword"
        assert _escape_cell("") == ""

    def test_export_list_joined_with_pipe(self):
        row = {"keyword": "test", "tags": ["seo", "priority"]}
        csv_text = export_csv([row])
        assert "seo|priority" in csv_text

    def test_export_none_metrics_as_empty(self):
        row = {"keyword": "test", "search_volume": None, "cpc": None}
        csv_text = export_csv([row])
        lines = csv_text.strip().splitlines()
        # The data row should have empty cells for None values.
        data_line = lines[1]
        # search_volume column is second (after keyword); should be empty.
        assert ",," in data_line or data_line.split(",")[1] == ""


# ── Provider normalisation ────────────────────────────────────────────────────

class TestProviderNormalisation:
    def test_mock_provider_volume_range(self):
        from seo.keywords.provider import MockKeywordProvider
        provider = MockKeywordProvider()
        ideas = provider.research("plumber", [])
        for idea in ideas:
            # Mock always returns real numbers (never None).
            assert idea.volume is not None
            assert idea.volume >= 50
            assert idea.difficulty is not None

    def test_unavailable_metrics_stay_none_in_add(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        result = add_keyword(
            "tenant_a", pid, "orphan kw",
            search_volume=None, cpc=None, difficulty=None,
        )
        kw = result["keyword"]
        assert kw["search_volume"] is None
        assert kw["cpc"] is None
        assert kw["difficulty"] is None

    def test_research_service_intent_not_fabricated(self):
        """Provider intent must come from the mock, not be invented by the service."""
        clear_research_cache()
        pid = create_project("tenant_a", name="P")["project"]["id"]
        result = research("tenant_a", pid, seed_keyword="plumber")
        valid_intents = {i.value for i in SearchIntent}
        for idea in result["ideas"]:
            assert idea["intent"] in valid_intents


# ── Research cache ────────────────────────────────────────────────────────────

class TestResearchCache:
    def test_cache_hit_on_second_call(self):
        """Second identical research call must be a cache hit."""
        call_count = [0]
        original_research_fn = None

        from seo.keywords import provider as prov_module

        orig_get = prov_module.get_keyword_provider

        class CountingProvider:
            name = "mock"

            def research(self, topic, seeds):
                call_count[0] += 1
                from seo.keywords.provider import MockKeywordProvider
                return MockKeywordProvider().research(topic, seeds)

        def fake_get_provider():
            return CountingProvider()

        import seo.keywords.research_service as rs

        with patch.object(rs, "get_keyword_provider", fake_get_provider):
            clear_research_cache()
            pid = create_project("tenant_a", name="P")["project"]["id"]
            result1 = rs.research("tenant_a", pid, seed_keyword="dentist")
            result2 = rs.research("tenant_a", pid, seed_keyword="dentist")

        assert call_count[0] == 1, "Provider should only be called once; second call should hit cache"
        assert result1["cache_hit"] is False
        assert result2["cache_hit"] is True

    def test_cache_miss_on_different_params(self):
        call_count = [0]

        import seo.keywords.research_service as rs

        class CountingProvider:
            name = "mock"
            def research(self, topic, seeds):
                call_count[0] += 1
                from seo.keywords.provider import MockKeywordProvider
                return MockKeywordProvider().research(topic, seeds)

        with patch.object(rs, "get_keyword_provider", lambda: CountingProvider()):
            clear_research_cache()
            pid = create_project("tenant_a", name="P")["project"]["id"]
            rs.research("tenant_a", pid, seed_keyword="dentist")
            rs.research("tenant_a", pid, seed_keyword="plumber")

        assert call_count[0] == 2


# ── Filters ───────────────────────────────────────────────────────────────────

class TestResearchFilters:
    def _do_research(self, **kwargs):
        pid = create_project("tenant_a", name="FilterProj")["project"]["id"]
        clear_research_cache()
        return research("tenant_a", pid, seed_keyword="plumber", **kwargs)

    def test_volume_min_filter(self):
        result = self._do_research(volume_min=10000)
        for idea in result["ideas"]:
            assert idea["volume"] is None or idea["volume"] >= 10000

    def test_volume_max_filter(self):
        result = self._do_research(volume_max=1000)
        for idea in result["ideas"]:
            assert idea["volume"] is None or idea["volume"] <= 1000

    def test_difficulty_min_filter(self):
        result = self._do_research(difficulty_min=50)
        for idea in result["ideas"]:
            assert idea["difficulty"] is None or idea["difficulty"] >= 50

    def test_intent_filter(self):
        result = self._do_research(intent="commercial")
        for idea in result["ideas"]:
            assert idea["intent"] == "commercial"

    def test_length_min_filter(self):
        result = self._do_research(length_min=2)
        for idea in result["ideas"]:
            assert len(idea["keyword"].split()) >= 2

    def test_include_words_filter(self):
        result = self._do_research(include_words=["plumber"])
        for idea in result["ideas"]:
            assert "plumber" in idea["keyword"].lower()

    def test_exclude_words_filter(self):
        result = self._do_research(exclude_words=["near"])
        for idea in result["ideas"]:
            assert "near" not in idea["keyword"].lower()

    def test_questions_only_filter(self):
        result = self._do_research(questions_only=True)
        question_starters = ("how", "what", "why", "when", "where", "which", "who")
        for idea in result["ideas"]:
            kw = idea["keyword"].lower()
            assert any(kw.startswith(q) or f" {q}" in kw for q in question_starters) or \
                   any(kw.startswith(p) for p in ("is ", "are ", "can ", "do ", "does "))

    def test_existing_ranking_flag(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        # Seed the project with some known mock keywords.
        from seo.keywords.provider import MockKeywordProvider
        ideas = MockKeywordProvider().research("plumber", [])
        if ideas:
            first_kw = ideas[0].keyword
            add_keyword("tenant_a", pid, first_kw)
            clear_research_cache()
            result = research("tenant_a", pid, seed_keyword="plumber")
            existing = [i for i in result["ideas"] if i["existing_ranking"]]
            assert len(existing) >= 1


# ── Clustering ────────────────────────────────────────────────────────────────

class TestClustering:
    def _ideas(self):
        return [
            {"keyword": "best plumber london", "intent": "commercial"},
            {"keyword": "best plumber near me", "intent": "commercial"},
            {"keyword": "how to fix pipes", "intent": "informational"},
            {"keyword": "plumber emergency 24h", "intent": "transactional"},
            {"keyword": "buy pipe wrench", "intent": "transactional"},
        ]

    def test_determinism(self):
        ideas = self._ideas()
        clusters_a = cluster_keywords_deterministic(ideas)
        clusters_b = cluster_keywords_deterministic(ideas)
        assert [c["name"] for c in clusters_a] == [c["name"] for c in clusters_b]
        assert [c["keywords"] for c in clusters_a] == [c["keywords"] for c in clusters_b]

    def test_groups_by_stem_and_intent(self):
        ideas = self._ideas()
        clusters = cluster_keywords_deterministic(ideas)
        # "best plumber london" and "best plumber near me" share stem "best" + intent "commercial"
        best_cluster = next((c for c in clusters if c["name"] == "best"), None)
        assert best_cluster is not None
        assert "best plumber london" in best_cluster["keywords"]
        assert "best plumber near me" in best_cluster["keywords"]

    def test_auto_cluster_project(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        result = auto_cluster_project("tenant_a", pid, is_mock=True)
        assert result["created"] > 0
        assert len(result["clusters"]) > 0

    def test_auto_cluster_determinism(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        # Reset cluster repo before second call to get a clean run.
        result1 = auto_cluster_project("tenant_a", pid, is_mock=True)
        from seo.search_stores import get_keyword_cluster_repository
        # Cluster IDs are unique UUIDs, but names + keywords should be the same.
        names1 = sorted(c["name"] for c in result1["clusters"])
        # Run on a fresh project with the same keywords.
        pid2 = create_project("tenant_a", name="P2")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid2, idea["keyword"], intent=idea["intent"])
        result2 = auto_cluster_project("tenant_a", pid2, is_mock=True)
        names2 = sorted(c["name"] for c in result2["clusters"])
        assert names1 == names2

    def test_rename_cluster(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        auto = auto_cluster_project("tenant_a", pid, is_mock=True)
        cid = auto["clusters"][0]["id"]
        result = rename_cluster("tenant_a", cid, "My Custom Name")
        assert result["cluster"]["name"] == "My Custom Name"

    def test_assign_target_url(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        auto = auto_cluster_project("tenant_a", pid, is_mock=True)
        cid = auto["clusters"][0]["id"]
        result = assign_target_url("tenant_a", cid, "/services/plumbing")
        assert result["cluster"]["target_url"] == "/services/plumbing"

    def test_merge_clusters(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        auto = auto_cluster_project("tenant_a", pid, is_mock=True)
        clusters = auto["clusters"]
        if len(clusters) < 2:
            pytest.skip("Not enough clusters to merge")
        src_id = clusters[0]["id"]
        tgt_id = clusters[1]["id"]
        result = merge_clusters("tenant_a", [src_id], tgt_id)
        assert "cluster" in result
        merged_kw_ids = result["cluster"]["keyword_ids"]
        original_combined = (
            clusters[0]["keyword_ids"] + clusters[1]["keyword_ids"]
        )
        assert len(merged_kw_ids) == len(set(original_combined))

    def test_split_cluster(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        for idea in self._ideas():
            add_keyword("tenant_a", pid, idea["keyword"], intent=idea["intent"])
        auto = auto_cluster_project("tenant_a", pid, is_mock=True)
        big_cluster = max(auto["clusters"], key=lambda c: len(c["keyword_ids"]))
        if len(big_cluster["keyword_ids"]) < 2:
            pytest.skip("Cluster too small to split")
        cid = big_cluster["id"]
        split_id = big_cluster["keyword_ids"][:1]
        result = split_cluster("tenant_a", cid, split_id, new_cluster_name="Split Cluster")
        assert "new_cluster" in result
        assert result["new_cluster"]["name"] == "Split Cluster"


# ── Intent classification ─────────────────────────────────────────────────────

class TestIntentClassification:
    @pytest.mark.parametrize("keyword,expected_intent", [
        ("how to fix a leaky pipe", SearchIntent.INFORMATIONAL),
        ("what is seo", SearchIntent.INFORMATIONAL),
        ("guide to plumbing", SearchIntent.INFORMATIONAL),
        ("buy pipe wrench online", SearchIntent.TRANSACTIONAL),
        ("plumber near me", SearchIntent.LOCAL),
        ("plumber in london", SearchIntent.LOCAL),
        ("best plumber reviews", SearchIntent.COMMERCIAL),
        ("plumber vs hvac contractor", SearchIntent.COMMERCIAL),
        ("plumber login account", SearchIntent.NAVIGATIONAL),
        ("download plumber app", SearchIntent.NAVIGATIONAL),
    ])
    def test_classify_keyword(self, keyword, expected_intent):
        result = classify_intent(keyword)
        assert result == expected_intent, f"'{keyword}' -> expected {expected_intent}, got {result}"

    def test_batch_classification(self):
        keywords = ["how to do seo", "buy now cheap", "local plumber near me"]
        results = classify_intents_batch(keywords, is_mock=True)
        assert len(results) == 3
        assert results[0]["intent"] == SearchIntent.INFORMATIONAL.value
        assert results[1]["intent"] == SearchIntent.TRANSACTIONAL.value
        assert results[2]["intent"] == SearchIntent.LOCAL.value

    def test_unknown_intent_fallback(self):
        result = classify_intent("xyzzy qwerty frobnicate")
        assert result == SearchIntent.UNKNOWN


# ── Target-page assignment ────────────────────────────────────────────────────

class TestTargetPageAssignment:
    def test_assign_target_page_to_keyword(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword("tenant_a", pid, "seo services")["keyword"]["id"]
        result = assign_target_page("tenant_a", kid, "/services/seo")
        assert result["keyword"]["target_page"] == "/services/seo"

    def test_assign_updates_and_persists(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword("tenant_a", pid, "seo audit")["keyword"]["id"]
        assign_target_page("tenant_a", kid, "/audit")
        retrieved = get_keyword("tenant_a", kid)
        assert retrieved["keyword"]["target_page"] == "/audit"


# ── Cross-tenant isolation ────────────────────────────────────────────────────

class TestCrossTenantIsolation:
    def test_tenant_b_cannot_see_tenant_a_project(self):
        pid = create_project("tenant_a", name="Secret")["project"]["id"]
        assert get_project("tenant_b", pid) == {}

    def test_tenant_b_cannot_see_tenant_a_keywords(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword("tenant_a", pid, "private keyword")["keyword"]["id"]
        assert get_keyword("tenant_b", kid) == {}

    def test_tenant_b_list_returns_empty(self):
        create_project("tenant_a", name="P")["project"]["id"]
        assert list_projects("tenant_b")["projects"] == []

    def test_tenant_b_cannot_update_tenant_a_keyword(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword("tenant_a", pid, "kw")["keyword"]["id"]
        result = update_keyword("tenant_b", kid, tags=["hacked"])
        assert result == {}

    def test_tenant_b_cannot_archive_tenant_a_project(self):
        pid = create_project("tenant_a", name="P")["project"]["id"]
        result = archive_project("tenant_b", pid)
        assert result == {}
        # Project still exists for tenant_a.
        assert get_project("tenant_a", pid) != {}


# ── Limit check path ─────────────────────────────────────────────────────────

class TestLimitChecks:
    def test_limit_check_does_not_raise_when_credits_disabled(self):
        """When the credit system is OFF (default), limits are advisory only."""
        from seo.metering_search import check_seo_limit, LIMIT_KEYWORD_PROJECTS
        result = check_seo_limit("tenant_x", LIMIT_KEYWORD_PROJECTS, used=9999)
        # Credit system OFF -> always allowed.
        assert result["allowed"] is True

    def test_enforce_limit_does_not_raise_when_credits_disabled(self):
        """Enforce should silently pass when the credit system is off."""
        from seo.metering_search import enforce_seo_limit, LIMIT_KEYWORD_PROJECTS, SeoLimitExceeded
        # Should not raise.
        enforce_seo_limit("tenant_x", LIMIT_KEYWORD_PROJECTS, used=9999)

    def test_create_project_succeeds_without_billing(self):
        """Project creation should succeed even with a high project count when billing is off."""
        for i in range(5):
            result = create_project("tenant_x", name=f"Project {i}")
            assert "project" in result

    def test_add_keyword_succeeds_without_billing(self):
        pid = create_project("tenant_x", name="P")["project"]["id"]
        for i in range(10):
            result = add_keyword("tenant_x", pid, f"keyword {i}")
            assert result["added"] is True


# ── Metric snapshot ───────────────────────────────────────────────────────────

class TestMetricSnapshot:
    def test_metric_snapshot_appended_on_add_with_volume(self):
        from seo.search_stores import get_keyword_metric_repository
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword(
            "tenant_a", pid, "test kw",
            search_volume=500, cpc=1.5, data_provider="mock",
        )["keyword"]["id"]
        metric_repo = get_keyword_metric_repository()
        metrics = metric_repo.list_where("tenant_a", keyword_id=kid)
        assert len(metrics) == 1
        _, m = metrics[0]
        assert m.search_volume == 500
        assert m.cpc == 1.5

    def test_no_metric_snapshot_when_no_provider_data(self):
        from seo.search_stores import get_keyword_metric_repository
        pid = create_project("tenant_a", name="P")["project"]["id"]
        kid = add_keyword("tenant_a", pid, "bare kw")["keyword"]["id"]
        metric_repo = get_keyword_metric_repository()
        metrics = metric_repo.list_where("tenant_a", keyword_id=kid)
        assert len(metrics) == 0


if __name__ == "__main__":
    import pytest as _pytest
    _pytest.main([__file__, "-v"])
