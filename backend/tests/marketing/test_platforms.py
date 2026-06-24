"""Tests for the marketing platform layer (strategy specs + dry-run adapters).

pytest is not installed in this env; tests are plain `def test_*` functions and
are also invoked directly by the validation harness. They must remain importable
and callable with no fixtures.
"""

from __future__ import annotations

from marketing.platforms import (
    ADAPTERS,
    DryRunResult,
    PlatformSpec,
    PostContent,
    SupportLevel,
    get_adapter,
    get_platform_spec,
    list_platform_specs,
)
from marketing.schemas import Platform


def test_every_platform_has_spec_or_fallback():
    """get_platform_spec never raises and always returns a PlatformSpec."""
    for p in Platform:
        spec = get_platform_spec(p)
        assert isinstance(spec, PlatformSpec)
        assert spec.platform  # non-empty
    # string + unknown inputs fall back gracefully
    assert isinstance(get_platform_spec("instagram"), PlatformSpec)
    assert isinstance(get_platform_spec("INSTAGRAM"), PlatformSpec)
    assert get_platform_spec("not_a_real_platform").platform == "generic"


def test_list_platform_specs_nonempty():
    specs = list_platform_specs()
    assert len(specs) >= 11
    assert all(isinstance(s, PlatformSpec) for s in specs)


def test_get_adapter_for_every_platform():
    """Every Platform resolves to an adapter; unknown strings fall back safely."""
    for p in Platform:
        adapter = get_adapter(p)
        assert adapter is not None
        assert adapter.platform == p
        assert isinstance(adapter.support_level, SupportLevel)
        assert adapter.dry_run is True
    # registry covers every enum member
    assert set(ADAPTERS.keys()) == set(Platform)
    # string + unknown inputs
    assert get_adapter("tiktok").platform == Platform.TIKTOK
    fallback = get_adapter("totally_unknown")
    assert fallback is not None
    assert fallback.support_level == SupportLevel.MANUAL_EXPORT


def test_nothing_publishes_live():
    """publish_post / schedule_post NEVER report a live post in default dry-run."""
    content = PostContent(platform="instagram", caption="hello world", hashtags=["pixie"])
    for p in Platform:
        adapter = get_adapter(p)
        pub = adapter.publish_post(content)
        sch = adapter.schedule_post(content, when="2026-07-01T10:00:00Z")
        assert isinstance(pub, DryRunResult)
        assert isinstance(sch, DryRunResult)
        assert pub.would_post is False, f"{p} publish_post would_post must be False"
        assert sch.would_post is False, f"{p} schedule_post would_post must be False"
        assert "dry-run" in pub.notes.lower()
        assert "dry-run" in sch.notes.lower()
        # capabilities must never advertise live publishing
        assert adapter.get_capabilities()["can_publish_live"] is False


def test_dry_run_post_has_preview_and_limit_checks():
    content = PostContent(
        platform="linkedin",
        caption="A thoughtful B2B insight worth sharing.",
        hashtags=["b2b", "marketing"],
        media_refs=["media://1"],
        cta="Read more",
    )
    adapter = get_adapter(Platform.LINKEDIN)
    result = adapter.dry_run_post(content)
    assert isinstance(result, DryRunResult)
    assert result.would_post is False
    assert isinstance(result.formatted_preview, dict)
    assert result.formatted_preview.get("text")
    assert isinstance(result.limit_checks, list)
    assert len(result.limit_checks) >= 1
    # each check has the documented shape
    for c in result.limit_checks:
        assert "name" in c and "passed" in c and "detail" in c


def test_caption_over_limit_fails_a_check():
    """Content exceeding a platform caption cap must fail a limit check."""
    # X caps captions at 280 chars in our spec.
    spec = get_platform_spec(Platform.X)
    cap = spec.limits["caption_chars"]
    long_caption = "x" * (cap + 50)
    content = PostContent(platform="x", caption=long_caption)
    adapter = get_adapter(Platform.X)
    checks = adapter.check_limits(content)
    caption_check = next(c for c in checks if c["name"] == "caption_length")
    assert caption_check["passed"] is False
    # and the dry-run surfaces the failure in notes
    result = adapter.dry_run_post(content)
    assert "failed" in result.notes.lower()


def test_hashtag_over_limit_fails_a_check():
    """Too many hashtags fails the hashtag_count check (X allows few)."""
    spec = get_platform_spec(Platform.X)
    cap = spec.limits["hashtags"]
    content = PostContent(platform="x", caption="hi", hashtags=[f"tag{i}" for i in range(cap + 5)])
    adapter = get_adapter(Platform.X)
    checks = adapter.check_limits(content)
    tag_check = next(c for c in checks if c["name"] == "hashtag_count")
    assert tag_check["passed"] is False


def test_export_manual_post():
    content = PostContent(
        platform="nextdoor",
        caption="We just opened around the corner!",
        hashtags=["local"],
    )
    adapter = get_adapter(Platform.NEXTDOOR)
    export = adapter.export_manual_post(content)
    assert "copy_paste_text" in export
    assert "We just opened" in export["copy_paste_text"]
    assert "instructions" in export


def test_meta_class_serves_both_instagram_and_facebook():
    """The shared Meta adapter must not leak platform across instances."""
    ig = get_adapter(Platform.INSTAGRAM)
    fb = get_adapter(Platform.FACEBOOK)
    assert ig.platform == Platform.INSTAGRAM
    assert fb.platform == Platform.FACEBOOK


if __name__ == "__main__":
    for _name, _fn in list(vars().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("platforms OK")
