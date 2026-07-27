"""Core crawl loop for the Pixie SEO crawler.

Public API:
    run_crawl(job, site, *, fetch=safe_fetch, store=None) -> dict

The crawl loop:
    1. Reads the site config + job config to set limits.
    2. Seeds the frontier from the site's canonical_base_url (or single URL).
    3. BFS loop: fetch → parse → extract links → persist CrawledPage.
    4. Updates CrawlJob progress counters incrementally.
    5. Respects cancellation (re-reads job status every iteration).
    6. Returns a summary dict.

All network calls go through the injected ``fetch`` callable (safe_fetch by
default) so SSRF protection applies and tests can inject a fake fetcher.

Deduplication:
    - By normalized URL (primary): each URL crawled at most once.
    - By content hash (SHA-1): if a new page has the same hash as an already-
      stored page, it is NOT stored as a new CrawledPage; the relationship is
      recorded in ``extra`` of the first-seen page instead.  This prevents
      storing duplicate content pages but records that they exist.

Rate limiting:
    - ``min_delay_s`` (default 0.5 s): minimum wall-clock delay between
      successive requests to the same host.
    - ``per_host_concurrency``: always 1 in this synchronous implementation
      (concurrency is handled externally by the worker pool).

Memory:
    ``safe_fetch`` enforces max_bytes so we never hold a giant HTML in memory
    beyond one iteration; we parse the text then let the reference go.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import deque
from typing import Callable, Dict, List, Optional, Set, Any
from urllib.parse import urlsplit

from seo.url_guard import UrlRejected, safe_fetch
from seo.crawler.normalize import normalize_url, same_domain
from seo.crawler.robots import RobotsHandler
from seo.crawler.discovery import LinkDiscovery
from seo.mode_external.parser import html_to_page
from seo.stores import (
    CrawlJob, CrawlStatus, CrawlType, CrawledPage, RobotsPolicy, Site,
    get_crawl_job_repository, get_crawled_page_repository, update_crawl_job,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_MIN_DELAY_S: float = 0.5   # minimum gap between requests to same host
DEFAULT_MAX_RETRIES: int = 2        # transient errors retried this many times
DEFAULT_RETRY_BASE_S: float = 1.0   # base back-off between retries (doubles)
DEFAULT_TIMEOUT_S: float = 15.0     # per-request timeout
DEFAULT_MAX_BYTES: int = 2_000_000  # 2 MB per page
DEFAULT_MAX_REDIRECTS: int = 5

# Progress update frequency (every N pages crawled)
PROGRESS_UPDATE_EVERY: int = 5

# Transient HTTP codes that warrant a retry
TRANSIENT_STATUS_CODES: frozenset[int] = frozenset({429, 500, 502, 503, 504})


class _Store:
    """Thin wrapper around the durable repositories used during a crawl.

    Makes the store injectable for tests: a test can pass store=FakeStore().
    The real implementation delegates to get_crawled_page_repository() etc.
    """

    def __init__(self):
        self._page_repo = get_crawled_page_repository()
        self._job_repo = get_crawl_job_repository()

    def save_page(self, page: CrawledPage) -> str:
        """Persist a CrawledPage; return the generated page_id."""
        pid, _ = self._page_repo.create(page)
        return pid

    def update_job(self, tenant_id: str, job_id: str, **fields) -> None:
        self._job_repo.update(tenant_id, job_id, **fields)

    def get_job(self, tenant_id: str, job_id: str) -> Optional[CrawlJob]:
        result = self._job_repo.get(tenant_id, job_id)
        if result:
            return result[1]
        return None

    def existing_pages_for_job(self, tenant_id: str, job_id: str) -> Set[str]:
        """Return the set of normalized_urls already persisted for this job.

        Used during crash-restart to avoid re-persisting pages already done.
        """
        total, pairs = self._page_repo.list_by_crawl_job(
            tenant_id, job_id, limit=100_000, offset=0
        )
        return {page.normalized_url for _, page in pairs if page.normalized_url}


def _content_hash(text: str) -> str:
    """SHA-1 hex of the page text (fast, not security-critical)."""
    return hashlib.sha1(text.encode("utf-8", errors="replace")).hexdigest()


def _count_words(text: str) -> int:
    """Rough word count from whitespace-split."""
    return len(text.split())


_OUT_LINKS_CAP: int = 500  # max outbound link targets stored per page


def _extract_page_meta(html_text: str, url: str) -> dict:
    """Extract SEO fields from HTML; returns a flat dict of page metadata.

    The returned dict includes ``out_links`` — a deduplicated, capped list of
    normalized same-domain outbound link target URLs.  This list is stored in
    ``extra["out_links"]`` by the caller and lets the post-processing layer
    reconstruct the full internal-link graph without re-fetching pages.
    """
    try:
        parsed = html_to_page(html_text, url)
    except Exception:
        parsed = {}

    title = parsed.get("title") or ""
    meta_desc = parsed.get("meta_description") or ""
    headings = parsed.get("headings") or []
    h1 = next((h["text"] for h in headings if isinstance(h, dict) and h.get("level") == 1), "")
    canonical = parsed.get("canonical") or ""
    content = parsed.get("content") or ""
    word_count = _count_words(content) if content else 0
    robots_meta = parsed.get("robots") or ""
    links = parsed.get("links") or []

    # Indexability: noindex or nofollow in meta robots => non-indexable
    indexability = "indexable"
    if robots_meta:
        robots_lower = robots_meta.lower()
        if "noindex" in robots_lower:
            indexability = "noindex"
        elif "nofollow" in robots_lower:
            indexability = "nofollow"

    # Build the deduplicated set of normalized same-domain outbound link targets.
    # We use the page's own URL as the base for resolution and same_domain check.
    seen_out: set = set()
    out_links_ordered: list = []
    for lnk in links:
        if not isinstance(lnk, dict):
            continue
        href = (lnk.get("href") or "").strip()
        if not href:
            continue
        normalized = normalize_url(url, href)
        if normalized is None:
            continue
        if not same_domain(url, normalized):
            continue
        if normalized in seen_out:
            continue
        seen_out.add(normalized)
        out_links_ordered.append(normalized)
        if len(out_links_ordered) >= _OUT_LINKS_CAP:
            break

    # Count internal outbound links (those without explicit internal=False)
    internal_links_out = sum(
        1 for lnk in links
        if isinstance(lnk, dict) and lnk.get("internal") is not False
    )

    return {
        "title": title,
        "meta_description": meta_desc,
        "h1": h1,
        "canonical": canonical,
        "word_count": word_count,
        "indexability": indexability,
        "internal_links_out": internal_links_out,
        "content": content,
        "out_links": out_links_ordered,
    }


def _is_html_content_type(content_type: str) -> bool:
    ct = (content_type or "").lower()
    return ct.startswith("text/html") or ct.startswith("application/xhtml")


class _HostRateLimiter:
    """Per-host rate limiter using wall-clock time.

    Tracks the last request time per host and sleeps (or skips) to enforce
    a minimum inter-request delay.
    """

    def __init__(self, min_delay_s: float, time_fn: Callable = time.time, sleep_fn: Callable = time.sleep):
        self._min_delay = min_delay_s
        self._last_request: Dict[str, float] = {}
        self._time_fn = time_fn
        self._sleep_fn = sleep_fn

    def wait(self, host: str) -> None:
        """Block until the min-delay since the last request to *host* has elapsed."""
        now = self._time_fn()
        last = self._last_request.get(host, 0.0)
        elapsed = now - last
        if elapsed < self._min_delay:
            self._sleep_fn(self._min_delay - elapsed)
        self._last_request[host] = self._time_fn()


def run_crawl(
    job: CrawlJob,
    site: Site,
    *,
    job_id: str = "",
    fetch: Callable = safe_fetch,
    store: Any = None,
    min_delay_s: float = DEFAULT_MIN_DELAY_S,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_base_s: float = DEFAULT_RETRY_BASE_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    max_bytes: int = DEFAULT_MAX_BYTES,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    # Injected clock/sleep for testing
    time_fn: Callable = time.time,
    sleep_fn: Callable = time.sleep,
) -> dict:
    """Run a full crawl for *job* against *site*.

    Parameters
    ----------
    job:
        The ``CrawlJob`` dataclass.  ``job.tenant_id``, ``job.site_id``,
        ``job.crawl_type``, and ``job.requested_limit`` are read.
    site:
        The ``Site`` dataclass with config (robots_policy, included/excluded
        paths, canonical_base_url, etc.).
    job_id:
        The persistence ID for the job (used to update progress).
    fetch:
        Injectable fetch callable; must match ``safe_fetch``'s signature.
    store:
        Injectable store object.  If None, uses the real ``_Store()``.
    min_delay_s, max_retries, retry_base_s, timeout_s, max_bytes, max_redirects:
        Crawl parameters; see module-level defaults.
    time_fn, sleep_fn:
        Injected clock/sleep (for testing without real sleeps).

    Returns
    -------
    dict with keys:
        crawled_count, failed_count, discovered_count, skipped_count,
        duplicate_content_count, cancelled (bool)
    """
    if store is None:
        store = _Store()

    tenant_id = job.tenant_id
    site_id = job.site_id
    page_limit = job.requested_limit
    crawl_type = job.crawl_type

    base_url = (site.canonical_base_url or "").rstrip("/")
    if not base_url:
        # Fall back to constructing from domain
        base_url = f"https://{site.domain}".rstrip("/")

    # ---- Initialize robots ----
    robots = RobotsHandler(
        base_url,
        fetch=fetch,
        robots_policy=site.robots_policy or RobotsPolicy.RESPECT,
    )
    robots.fetch()

    # ---- Build link discoverer ----
    discovery = LinkDiscovery(base_url, site)

    # ---- Rate limiter ----
    rate_limiter = _HostRateLimiter(min_delay_s, time_fn=time_fn, sleep_fn=sleep_fn)

    # ---- Frontier ----
    if crawl_type == CrawlType.SINGLE:
        seed_urls = [normalize_url(base_url, base_url) or base_url]
    else:
        seed_urls = [normalize_url(base_url, base_url) or base_url]

    # Recover already-crawled pages on restart
    already_crawled_urls: Set[str] = store.existing_pages_for_job(tenant_id, job_id) if job_id else set()

    visited: Set[str] = set(already_crawled_urls)
    content_hashes_seen: Dict[str, str] = {}  # hash -> first URL

    frontier: deque[str] = deque()
    for url in seed_urls:
        if url not in visited:
            frontier.append(url)

    # Counters
    crawled_count: int = 0
    failed_count: int = 0
    discovered_count: int = len(seed_urls)
    skipped_count: int = 0
    duplicate_content_count: int = 0
    was_cancelled: bool = False

    def _update_progress() -> None:
        if not job_id:
            return
        total = max(discovered_count, 1)
        progress = min(1.0, crawled_count / total) if total > 0 else 0.0
        try:
            store.update_job(
                tenant_id, job_id,
                discovered_count=discovered_count,
                crawled_count=crawled_count,
                failed_count=failed_count,
                progress=progress,
            )
        except Exception as exc:
            logger.debug("run_crawl: progress update failed: %s", exc)

    def _check_cancelled() -> bool:
        """Re-read job from store; return True if cancelled."""
        if not job_id:
            return False
        try:
            current_job = store.get_job(tenant_id, job_id)
            if current_job and current_job.status == CrawlStatus.CANCELLED:
                return True
        except Exception:
            pass
        return False

    # ---- Main BFS loop ----
    iteration = 0
    while frontier and crawled_count < page_limit:
        iteration += 1

        # Check cancellation periodically
        if iteration % 10 == 0:
            if _check_cancelled():
                was_cancelled = True
                logger.info("run_crawl: job %s cancelled, stopping", job_id)
                break

        url = frontier.popleft()
        if url in visited:
            continue
        visited.add(url)

        # robots.txt check
        try:
            path = urlsplit(url).path or "/"
        except Exception:
            path = "/"
        if not robots.is_allowed(path):
            skipped_count += 1
            continue

        # Rate limiting
        try:
            host = urlsplit(url).hostname or ""
        except Exception:
            host = ""
        if host:
            rate_limiter.wait(host)

        # Fetch with retry
        fetch_result = _fetch_with_retry(
            url=url,
            fetch=fetch,
            max_retries=max_retries,
            retry_base_s=retry_base_s,
            timeout_s=timeout_s,
            max_bytes=max_bytes,
            max_redirects=max_redirects,
            sleep_fn=sleep_fn,
        )

        if fetch_result is None:
            # UrlRejected or max retries exceeded
            failed_count += 1
            if iteration % PROGRESS_UPDATE_EVERY == 0:
                _update_progress()
            continue

        status_code = fetch_result.get("status", 0)
        content_type = fetch_result.get("content_type", "")
        html_text = fetch_result.get("text", "")
        final_url = fetch_result.get("final_url", url)
        response_time_ms = fetch_result.get("response_time_ms", 0)
        page_size_bytes = len(html_text.encode("utf-8", errors="replace"))

        # Normalize the final URL (after redirects) and dedup
        final_normalized = normalize_url(base_url, final_url) or final_url
        if final_normalized != url and final_normalized in visited:
            skipped_count += 1
            continue
        if final_normalized != url:
            visited.add(final_normalized)

        # Content dedup
        is_html = _is_html_content_type(content_type)
        content_hash = ""
        is_duplicate_content = False
        if is_html and html_text:
            content_hash = _content_hash(html_text)
            if content_hash in content_hashes_seen:
                duplicate_content_count += 1
                is_duplicate_content = True
                first_url = content_hashes_seen[content_hash]
                logger.debug(
                    "run_crawl: duplicate content %s (same as %s), skipping store",
                    url, first_url,
                )
            else:
                content_hashes_seen[content_hash] = url

        # Extract page metadata
        extra: Dict[str, Any] = {}
        if is_duplicate_content:
            extra["duplicate_of"] = content_hashes_seen.get(content_hash, "")

        meta_fields: dict = {}
        if is_html and html_text and not is_duplicate_content:
            try:
                meta_fields = _extract_page_meta(html_text, url)
            except Exception as exc:
                logger.debug("run_crawl: meta extraction error %s: %s", url, exc)

        # Persist the same-domain outbound link targets in extra["out_links"].
        # This allows post-processing to reconstruct the link graph.
        out_links = meta_fields.get("out_links")
        if out_links:
            extra["out_links"] = out_links

        # Persist CrawledPage (even for non-HTML — record the fetch)
        page = CrawledPage(
            tenant_id=tenant_id,
            site_id=site_id,
            crawl_job_id=job_id,
            url=url,
            normalized_url=final_normalized,
            status_code=status_code,
            content_type=content_type,
            canonical=meta_fields.get("canonical", ""),
            title=meta_fields.get("title", ""),
            meta_description=meta_fields.get("meta_description", ""),
            h1=meta_fields.get("h1", ""),
            word_count=meta_fields.get("word_count", 0),
            content_hash=content_hash,
            indexability=meta_fields.get("indexability", "indexable"),
            internal_links_in=0,  # computed in post-processing
            internal_links_out=meta_fields.get("internal_links_out", 0),
            response_time_ms=response_time_ms,
            page_size_bytes=page_size_bytes,
            extra=extra,
        )

        if not is_duplicate_content:
            try:
                store.save_page(page)
            except Exception as exc:
                logger.warning("run_crawl: save_page failed for %s: %s", url, exc)

        crawled_count += 1

        # Discover new links (only for HTML pages; only for site crawls)
        if is_html and html_text and crawl_type == CrawlType.SITE and not is_duplicate_content:
            new_links = discovery.extract(html_text, url)
            added = 0
            for link_url in new_links:
                if link_url not in visited:
                    frontier.append(link_url)
                    added += 1
            if added:
                discovered_count += added

        # Update progress
        if crawled_count % PROGRESS_UPDATE_EVERY == 0:
            _update_progress()

    # Final progress update
    _update_progress()

    return {
        "crawled_count": crawled_count,
        "failed_count": failed_count,
        "discovered_count": discovered_count,
        "skipped_count": skipped_count,
        "duplicate_content_count": duplicate_content_count,
        "cancelled": was_cancelled,
    }


def _fetch_with_retry(
    *,
    url: str,
    fetch: Callable,
    max_retries: int,
    retry_base_s: float,
    timeout_s: float,
    max_bytes: int,
    max_redirects: int,
    sleep_fn: Callable,
) -> Optional[dict]:
    """Fetch *url* with bounded retries on transient errors.

    Returns the fetch result dict, or None if:
    - UrlRejected (terminal — not retried)
    - All retries exhausted
    """
    attempts = 0
    while True:
        start_ns = time.perf_counter_ns()
        try:
            result = fetch(
                url,
                timeout_s=timeout_s,
                max_bytes=max_bytes,
                max_redirects=max_redirects,
                require_html=False,
                user_agent="PixieSEOBot/1.0 (+https://pixie.example/bot)",
            )
            elapsed_ms = int((time.perf_counter_ns() - start_ns) / 1_000_000)
            result["response_time_ms"] = elapsed_ms
            return result

        except UrlRejected as exc:
            # SSRF / size / redirect violations: terminal, do not retry
            logger.info("run_crawl: UrlRejected %s reason=%s", url, exc.reason)
            return None

        except Exception as exc:
            attempts += 1
            if attempts > max_retries:
                logger.warning(
                    "run_crawl: max retries (%d) exceeded for %s: %s",
                    max_retries, url, exc,
                )
                return None
            backoff = retry_base_s * (2 ** (attempts - 1))
            logger.debug(
                "run_crawl: transient error for %s (attempt %d/%d): %s — retry in %.1fs",
                url, attempts, max_retries, exc, backoff,
            )
            sleep_fn(backoff)
