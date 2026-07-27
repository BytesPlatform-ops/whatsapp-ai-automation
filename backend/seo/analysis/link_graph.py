"""Internal-link graph aggregation for Pixie SEO.

Public API
----------
aggregate_internal_links(tenant, crawl_job_id) -> dict

Reads every CrawledPage for the given crawl job, builds inbound-link counts
from each page's ``extra["out_links"]``, writes ``internal_links_in`` back to
each page via the repository, and computes BFS depth from the site seed
(homepage / first-crawled page).

Returns a summary dict:
    {
        "total_pages": int,
        "orphan_candidates": list[str],   # URLs with 0 inbound links (excl. seed)
        "depth_map": dict[str, int],      # url -> BFS depth (0 = seed)
        "inbound_map": dict[str, int],    # url -> inbound link count
        "seed_url": str,
    }

No network calls are made; all data comes from the already-persisted store.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Tuple

from seo.stores import (
    get_crawled_page_repository,
    list_pages,
)

logger = logging.getLogger(__name__)

# Maximum pages fetched in a single list_pages call.
_PAGE_BATCH = 10_000


def _load_all_pages(tenant: str, crawl_job_id: str) -> List[Tuple[str, object]]:
    """Fetch every CrawledPage row for the given crawl job."""
    total, first_batch = list_pages(tenant, crawl_job_id, limit=_PAGE_BATCH, offset=0)
    pairs = list(first_batch)
    offset = len(pairs)
    while offset < total:
        _, batch = list_pages(tenant, crawl_job_id, limit=_PAGE_BATCH, offset=offset)
        if not batch:
            break
        pairs.extend(batch)
        offset += len(batch)
    return pairs


def aggregate_internal_links(
    tenant: str,
    crawl_job_id: str,
) -> dict:
    """Build inbound-link counts and BFS depth map for every crawled page.

    Steps
    -----
    1. Load all CrawledPage rows for the job.
    2. Build a URL-keyed index (``normalized_url`` preferred, else ``url``).
    3. For each page, iterate over ``extra["out_links"]`` and increment the
       inbound counter of every target URL that also appears in the crawl.
    4. Write the computed ``internal_links_in`` back to each page row.
    5. BFS from the seed (lexicographically-first / smallest crawl position,
       i.e. the first page in insertion order) to compute depth.
    6. Identify orphan candidates: in-scope pages with 0 inbound links
       that are not the seed itself.

    Parameters
    ----------
    tenant:
        Tenant identifier.
    crawl_job_id:
        The crawl job whose pages to process.

    Returns
    -------
    dict with keys:
        total_pages (int), seed_url (str), inbound_map (dict[url, int]),
        depth_map (dict[url, int]), orphan_candidates (list[str]).
    """
    pairs = _load_all_pages(tenant, crawl_job_id)
    if not pairs:
        return {
            "total_pages": 0,
            "seed_url": "",
            "inbound_map": {},
            "depth_map": {},
            "orphan_candidates": [],
        }

    repo = get_crawled_page_repository()

    # ── Build URL index ────────────────────────────────────────────────────────
    # Map normalized_url -> (page_id, page)  for fast lookup
    # We also keep a map from raw url -> normalized_url for cross-referencing.
    url_to_id: Dict[str, str] = {}        # normalized_url -> page_id
    url_to_page: Dict[str, object] = {}   # normalized_url -> CrawledPage

    for page_id, page in pairs:
        key = page.normalized_url or page.url
        if key and key not in url_to_page:
            url_to_id[key] = page_id
            url_to_page[key] = page

    crawled_urls: Set[str] = set(url_to_page.keys())

    # ── Build inbound count map ────────────────────────────────────────────────
    inbound: Dict[str, int] = defaultdict(int)

    for _page_id, page in pairs:
        out_links: List[str] = (page.extra or {}).get("out_links", [])
        src_key = page.normalized_url or page.url
        for target in out_links:
            # Only count links that point to a page we actually crawled,
            # and don't count self-links.
            if target in crawled_urls and target != src_key:
                inbound[target] += 1

    # Ensure every crawled URL has an entry (even if count is 0)
    for url in crawled_urls:
        if url not in inbound:
            inbound[url] = 0

    # ── Persist internal_links_in ──────────────────────────────────────────────
    for page_id, page in pairs:
        key = page.normalized_url or page.url
        count = inbound.get(key, 0)
        try:
            repo.update(tenant, page_id, internal_links_in=count)  # type: ignore[arg-type]
        except Exception as exc:
            logger.debug(
                "aggregate_internal_links: failed to update page %s: %s", page_id, exc
            )

    # ── Determine seed (first page in insertion order) ─────────────────────────
    first_id, first_page = pairs[0]
    seed_url = first_page.normalized_url or first_page.url

    # ── BFS depth computation ──────────────────────────────────────────────────
    # Build adjacency list: source -> set of targets (within crawled set).
    adjacency: Dict[str, Set[str]] = defaultdict(set)
    for _page_id, page in pairs:
        src_key = page.normalized_url or page.url
        out_links = (page.extra or {}).get("out_links", [])
        for target in out_links:
            if target in crawled_urls and target != src_key:
                adjacency[src_key].add(target)

    depth_map: Dict[str, int] = {}
    queue: deque = deque()
    queue.append((seed_url, 0))
    depth_map[seed_url] = 0

    while queue:
        current, d = queue.popleft()
        for neighbor in adjacency.get(current, set()):
            if neighbor not in depth_map:
                depth_map[neighbor] = d + 1
                queue.append((neighbor, d + 1))

    # Pages not reachable from the seed get depth = None (represented as -1 in
    # inbound_map; not stored; returned in orphan list).
    for url in crawled_urls:
        if url not in depth_map:
            depth_map[url] = -1  # unreachable

    # ── Orphan candidates ─────────────────────────────────────────────────────
    # A page is an orphan candidate if:
    #   - It is not the seed URL.
    #   - It has 0 inbound internal links from any crawled page.
    orphan_candidates: List[str] = [
        url for url in crawled_urls
        if url != seed_url and inbound.get(url, 0) == 0
    ]
    orphan_candidates.sort()

    return {
        "total_pages": len(crawled_urls),
        "seed_url": seed_url,
        "inbound_map": dict(inbound),
        "depth_map": depth_map,
        "orphan_candidates": orphan_candidates,
    }
