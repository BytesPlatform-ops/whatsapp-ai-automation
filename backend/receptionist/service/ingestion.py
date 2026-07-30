"""Safe knowledge ingestion for the AI Receptionist (Wave 6, Parts 4-8).

Turns tenant-approved PDFs and websites into retrievable knowledge chunks, safely:

  * PDF — signature + size + page-count validation, encrypted/corrupt handling, a
    dependency-free (stdlib zlib) text extractor (text-first, NO OCR), bounded
    extracted text, per-page references. No script/embedded-object execution.
  * Website — the shared hardened SSRF-safe fetcher (``seo.url_guard.safe_fetch``):
    blocks localhost/private/link-local/metadata IPs, non-HTTP schemes, embedded
    credentials, oversized bodies, non-HTML types, and re-validates every redirect
    target (DNS-rebinding defence). Main-text extraction, bounded, same-domain crawl
    with page/depth caps and canonical-URL dedupe.

Sources + chunks are tenant-scoped and durable. Archived sources are excluded from
retrieval. Lexical indexing is $0; any future paid parse/embed reserves credits
first (Part 5). The model never chooses a URL — only explicit workspace sources are
fetched.
"""

from __future__ import annotations

import html
import os
import re
import zlib
from typing import Optional
from urllib.parse import urljoin, urlsplit

from . import stores
from .ids import new_id, now_iso

# ── limits (env-overridable) ──────────────────────────────────────────────────

def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except (TypeError, ValueError):
        return default


def max_file_bytes() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_MAX_FILE_BYTES", 10_000_000)


def max_pdf_pages() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_MAX_PDF_PAGES", 50)


def max_fetch_bytes() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_MAX_FETCH_BYTES", 2_000_000)


def fetch_timeout_s() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_FETCH_TIMEOUT_SECONDS", 10)


def max_crawl_pages() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_MAX_CRAWL_PAGES", 10)


def max_crawl_depth() -> int:
    return _int("AI_RECEPTIONIST_KNOWLEDGE_MAX_CRAWL_DEPTH", 1)


CHUNK_CHARS = 800
MAX_EXTRACTED_CHARS = 200_000


class IngestionError(Exception):
    """Safe, non-leaky ingestion failure. ``reason`` is a fixed-category string."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


# ── filename / path safety ────────────────────────────────────────────────────

def safe_filename(name: str) -> str:
    base = os.path.basename(name or "document.pdf").replace("\\", "_")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._") or "document.pdf"
    return base[:120]


# ── PDF validation + extraction (dependency-free, text-first, no OCR) ─────────

def validate_pdf(data: bytes) -> None:
    if not data:
        raise IngestionError("empty_file")
    if len(data) > max_file_bytes():
        raise IngestionError("file_too_large")
    if not data[:5].startswith(b"%PDF-"):
        raise IngestionError("not_a_pdf")
    # Encrypted PDFs carry an /Encrypt entry in the trailer — we do not attempt to
    # decrypt; surface a clear error instead.
    if b"/Encrypt" in data:
        raise IngestionError("encrypted_pdf")


def _pdf_page_count(data: bytes) -> int:
    # Count page objects (best-effort). "/Type /Page" (not /Pages).
    return len(re.findall(rb"/Type\s*/Page[^s]", data)) or len(re.findall(rb"/Type\s*/Page\b", data))


def _stream_filters(window: bytes) -> list[str]:
    """Ordered decode filters declared for the stream (subset we support)."""
    filters: list[str] = []
    # PDF applies filters in listed order; ASCII85 (if present) precedes Flate.
    if b"/ASCII85Decode" in window or b"/A85" in window:
        filters.append("a85")
    if b"/FlateDecode" in window or b"/Fl" in window:
        filters.append("flate")
    return filters


def _decode_stream(raw: bytes, filters: list[str]) -> bytes:
    import base64
    data = raw
    for f in filters:
        if f == "a85":
            s = data.strip()
            if s.startswith(b"<~"):
                s = s[2:]
            if s.endswith(b"~>"):
                s = s[:-2]
            try:
                data = base64.a85decode(s)
            except Exception:
                return b""
        elif f == "flate":
            try:
                data = zlib.decompress(data)
            except zlib.error:
                try:
                    data = zlib.decompressobj().decompress(data)
                except zlib.error:
                    return b""
    return data


_TEXT_OP = re.compile(rb"\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ", re.DOTALL)
_STR = re.compile(rb"\((?:\\.|[^\\()])*\)", re.DOTALL)


def _extract_strings(content: bytes) -> str:
    out: list[str] = []
    for m in _TEXT_OP.finditer(content):
        for s in _STR.finditer(m.group(0)):
            raw = s.group(0)[1:-1]
            txt = raw.replace(b"\\(", b"(").replace(b"\\)", b")").replace(b"\\\\", b"\\")
            try:
                out.append(txt.decode("latin-1"))
            except Exception:
                continue
    return " ".join(out)


def extract_pdf_text(data: bytes, *, max_pages: Optional[int] = None) -> tuple[str, int, list[str]]:
    """Return (full_text, page_count, per_stream_texts). Text-first; no OCR.

    Parses content streams (FlateDecode via stdlib zlib), pulls text from Tj/TJ
    operators. Bounded by page count and MAX_EXTRACTED_CHARS."""
    max_pages = max_pages or max_pdf_pages()
    page_count = _pdf_page_count(data)
    if page_count > max_pages:
        raise IngestionError("too_many_pages", f"{page_count}>{max_pages}")

    texts: list[str] = []
    total = 0
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\n?endstream", data, re.DOTALL):
        raw = m.group(1)
        # look back for the filter chain declared on this stream's dict
        window = data[max(0, m.start() - 400):m.start()]
        decoded = _decode_stream(raw, _stream_filters(window))
        if not decoded:
            continue
        piece = _extract_strings(decoded)
        if piece.strip():
            texts.append(piece.strip())
            total += len(piece)
        if total > MAX_EXTRACTED_CHARS:
            break
    full = "\n".join(texts)[:MAX_EXTRACTED_CHARS]
    return full, page_count, texts


# ── chunking ──────────────────────────────────────────────────────────────────

def _chunk(text: str, size: int = CHUNK_CHARS) -> list[str]:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i:i + size])
        i += size
    return chunks


# ── source + chunk persistence ────────────────────────────────────────────────

def _store_source(tenant_id: str, source: dict) -> dict:
    return stores.knowledge_sources().put(tenant_id, source)


def _store_chunks(tenant_id: str, source: dict, texts: list[str], *, pages: Optional[list[int]] = None) -> int:
    """Persist chunks as retrievable knowledge items, tagged with source metadata."""
    n = 0
    for idx, chunk_text in enumerate(texts):
        page = pages[idx] if pages and idx < len(pages) else None
        chunk_id = f"{source['id']}:c{idx}"
        stores.knowledge().put(tenant_id, {
            "id": chunk_id,
            "tenant_id": tenant_id,
            "source_id": source["id"],
            "source_type": source["source_type"],
            "title": source.get("title", ""),
            "url": source.get("url", ""),
            "page": page,
            "content": chunk_text,
            "category": source["source_type"],
            "version": source.get("version", ""),
            "archived": False,
            "chunk_id": chunk_id,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
        n += 1
    return n


def _delete_chunks(tenant_id: str, source_id: str) -> int:
    n = 0
    for item in stores.knowledge().list(tenant_id):
        if item.get("source_id") == source_id:
            stores.knowledge().delete(tenant_id, item["id"])
            n += 1
    return n


def list_sources(tenant_id: str) -> list[dict]:
    return stores.knowledge_sources().list(tenant_id)


def archive_source(tenant_id: str, source_id: str) -> bool:
    src = stores.knowledge_sources().get(tenant_id, source_id)
    if src is None:
        return False
    src["status"] = "archived"
    src["index_status"] = "archived"
    stores.knowledge_sources().put(tenant_id, src)
    for item in stores.knowledge().list(tenant_id):
        if item.get("source_id") == source_id and not item.get("archived"):
            item["archived"] = True
            stores.knowledge().put(tenant_id, item)
    return True


def delete_source(tenant_id: str, source_id: str) -> bool:
    src = stores.knowledge_sources().get(tenant_id, source_id)
    if src is None:
        return False
    _delete_chunks(tenant_id, source_id)
    return stores.knowledge_sources().delete(tenant_id, source_id)


# ── ingest: PDF ───────────────────────────────────────────────────────────────

def _enforce_source_limits(tenant_id: str) -> None:
    """Block new knowledge sources / monthly ingestions when over plan limit."""
    from . import limits
    limits.enforce(tenant_id, "knowledge_source")
    limits.enforce(tenant_id, "knowledge_ingestion")


def ingest_pdf(tenant_id: str, filename: str, data: bytes) -> dict:
    """Validate + extract + chunk + persist a PDF knowledge source. Invalid/rejected
    files write nothing and cost zero."""
    _enforce_source_limits(tenant_id)  # plan-limit gate BEFORE any parse/storage
    validate_pdf(data)  # raises IngestionError before any storage
    fname = safe_filename(filename)
    source_id = new_id("ksrc")
    version = now_iso()
    try:
        text, page_count, _ = extract_pdf_text(data)
    except IngestionError:
        raise
    except Exception as exc:  # corrupt PDF
        raise IngestionError("corrupt_pdf", str(exc)[:120]) from exc

    chunks = _chunk(text)
    source = {
        "id": source_id, "tenant_id": tenant_id, "source_type": "pdf",
        "title": fname, "url": "", "filename": fname, "bytes": len(data),
        "page_count": page_count, "version": version,
        "status": "active",
        "index_status": "indexed" if chunks else "empty",
        "chunk_count": len(chunks),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    _store_source(tenant_id, source)
    if chunks:
        _store_chunks(tenant_id, source, chunks)
    _count_ingestion(tenant_id, source_id)
    return source


def _count_ingestion(tenant_id: str, source_id: str) -> None:
    try:
        from . import usage
        usage.increment(tenant_id, "knowledge_ingestions", idempotency_key=f"ingest:{source_id}")
    except Exception:
        pass


# ── ingest: text ──────────────────────────────────────────────────────────────

def ingest_text(tenant_id: str, title: str, content: str) -> dict:
    _enforce_source_limits(tenant_id)
    source_id = new_id("ksrc")
    version = now_iso()
    chunks = _chunk(content)
    source = {
        "id": source_id, "tenant_id": tenant_id, "source_type": "text",
        "title": title or "Text source", "url": "", "version": version,
        "status": "active", "index_status": "indexed" if chunks else "empty",
        "chunk_count": len(chunks), "created_at": now_iso(), "updated_at": now_iso(),
    }
    _store_source(tenant_id, source)
    if chunks:
        _store_chunks(tenant_id, source, chunks)
    _count_ingestion(tenant_id, source_id)
    return source


# ── ingest: website ───────────────────────────────────────────────────────────

_TAG = re.compile(r"<[^>]+>")
_SCRIPT_STYLE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)
_HREF = re.compile(r'href=["\']([^"\'#?]+)', re.IGNORECASE)


def extract_main_text(html_text: str) -> tuple[str, str]:
    """Return (title, main_text) from raw HTML — tags/script/style stripped."""
    title_m = _TITLE.search(html_text or "")
    title = html.unescape(title_m.group(1)).strip() if title_m else ""
    body = _SCRIPT_STYLE.sub(" ", html_text or "")
    body = _TAG.sub(" ", body)
    body = html.unescape(body)
    body = re.sub(r"\s+", " ", body).strip()
    return title[:200], body


def _canonical(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path.rstrip("/") or "/"
    return f"{parts.scheme}://{parts.netloc.lower()}{path}"


def _fetch(url: str) -> dict:
    """Fetch a URL through the shared hardened SSRF-safe fetcher."""
    from seo.url_guard import safe_fetch, UrlRejected
    try:
        return safe_fetch(url, timeout_s=float(fetch_timeout_s()),
                          max_bytes=max_fetch_bytes(), require_html=True)
    except UrlRejected as exc:
        raise IngestionError(f"blocked_url:{exc.reason}") from exc
    except Exception as exc:  # network failure
        raise IngestionError("fetch_failed", str(exc)[:120]) from exc


def ingest_website(tenant_id: str, url: str, *, crawl: bool = False,
                   max_pages: Optional[int] = None, max_depth: Optional[int] = None) -> dict:
    """Fetch an approved workspace URL (optionally a bounded same-domain crawl),
    extract main text, chunk and persist. All fetches go through the SSRF guard."""
    if not (url.startswith("http://") or url.startswith("https://")):
        raise IngestionError("bad_scheme")
    _enforce_source_limits(tenant_id)
    max_pages = min(max_pages or max_crawl_pages(), max_crawl_pages())
    max_depth = min(max_depth if max_depth is not None else max_crawl_depth(), max_crawl_depth())
    root_domain = urlsplit(url).netloc.lower()

    source_id = new_id("ksrc")
    version = now_iso()
    seen: set[str] = set()
    pages: list[dict] = []
    failed = 0

    # Seed fetch: a blocked/failed seed is a hard error (raises). Only additional
    # crawl-discovered pages are skipped-and-counted on failure.
    seen.add(_canonical(url))
    seed = _fetch(url)  # raises IngestionError on SSRF/network/content-type
    seed_title, seed_text = extract_main_text(seed.get("text", ""))
    pages.append({"url": seed.get("final_url", url), "title": seed_title, "text": seed_text})

    frontier: list[tuple[str, int]] = []
    if crawl:
        for href in _HREF.findall(seed.get("text", "")):
            nxt = urljoin(seed.get("final_url", url), href)
            if urlsplit(nxt).netloc.lower() == root_domain and _canonical(nxt) not in seen:
                frontier.append((nxt, 1))

    while frontier and len(pages) < max_pages:
        current, depth = frontier.pop(0)
        canon = _canonical(current)
        if canon in seen:
            continue
        seen.add(canon)
        try:
            res = _fetch(current)
        except IngestionError:
            failed += 1
            continue
        title, text = extract_main_text(res.get("text", ""))
        pages.append({"url": res.get("final_url", current), "title": title, "text": text})
        # bounded same-domain crawl
        if crawl and depth < max_depth:
            for href in _HREF.findall(res.get("text", "")):
                nxt = urljoin(res.get("final_url", current), href)
                if urlsplit(nxt).netloc.lower() == root_domain and _canonical(nxt) not in seen:
                    frontier.append((nxt, depth + 1))

    if not pages:
        source = {
            "id": source_id, "tenant_id": tenant_id, "source_type": "website",
            "title": url, "url": url, "version": version, "status": "active",
            "index_status": "failed", "chunk_count": 0, "failed_pages": failed,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        _store_source(tenant_id, source)
        return source

    all_chunks: list[str] = []
    for pg in pages:
        all_chunks.extend(_chunk(f"{pg['title']} {pg['text']}"))
    source = {
        "id": source_id, "tenant_id": tenant_id, "source_type": "website",
        "title": pages[0]["title"] or url, "url": url,
        "pages_discovered": len(seen), "pages_indexed": len(pages), "failed_pages": failed,
        "version": version, "status": "active",
        "index_status": "indexed" if all_chunks else "empty",
        "chunk_count": len(all_chunks), "created_at": now_iso(), "updated_at": now_iso(),
    }
    _store_source(tenant_id, source)
    if all_chunks:
        _store_chunks(tenant_id, source, all_chunks)
    _count_ingestion(tenant_id, source_id)
    return source


# ── durable ingestion jobs (website crawl runs off the request thread) ────────

INGESTION_STATES = ("queued", "fetching", "extracting", "chunking", "indexing",
                    "completed", "failed", "cancelled")


def _put_job(tenant_id: str, job: dict) -> dict:
    return stores.ingestion_jobs().put(tenant_id, job)


def enqueue_website_ingestion(tenant_id: str, url: str, *, crawl: bool = False,
                              max_pages: Optional[int] = None) -> dict:
    """Record a durable ingestion job + a worker job so a multi-page crawl never
    holds a frontend request open. Returns the ingestion-job record (state=queued)."""
    if not (url.startswith("http://") or url.startswith("https://")):
        raise IngestionError("bad_scheme")
    job_id = new_id("ingj")
    rec = {
        "id": job_id, "tenant_id": tenant_id, "kind": "website",
        "url": url, "crawl": bool(crawl), "max_pages": max_pages,
        "status": "queued", "source_id": "", "error": "",
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    _put_job(tenant_id, rec)
    try:
        from receptionist.worker import jobs_store
        jobs_store.enqueue(tenant_id, "website_ingest",
                           {"ingestion_job_id": job_id, "url": url, "crawl": bool(crawl),
                            "max_pages": max_pages})
    except Exception:  # worker not available → job stays queued, retryable
        pass
    return rec


def run_website_ingestion(tenant_id: str, ingestion_job_id: str) -> dict:
    """Execute a queued website ingestion job through its states. Idempotent: a
    completed job is a no-op. Used by the worker handler."""
    rec = stores.ingestion_jobs().get(tenant_id, ingestion_job_id)
    if rec is None:
        return {"status": "failed", "error": "ingestion_job_not_found"}
    if rec.get("status") in ("completed", "cancelled"):
        return {"status": rec["status"], "source_id": rec.get("source_id", "")}

    def _advance(state: str) -> None:
        rec["status"] = state
        rec["updated_at"] = now_iso()
        _put_job(tenant_id, rec)

    try:
        _advance("fetching")
        source = ingest_website(tenant_id, rec["url"], crawl=bool(rec.get("crawl")),
                                max_pages=rec.get("max_pages"))
        _advance("indexing")
        rec["source_id"] = source["id"]
        rec["pages_indexed"] = source.get("pages_indexed", source.get("chunk_count", 0))
        _advance("completed" if source.get("index_status") != "failed" else "failed")
        return {"status": rec["status"], "source_id": source["id"]}
    except IngestionError as exc:
        rec["error"] = exc.reason
        _advance("failed")
        return {"status": "failed", "error": exc.reason}


def reindex_source(tenant_id: str, source_id: str) -> Optional[dict]:
    """Re-fetch/re-extract a website source (PDF/text need re-upload)."""
    src = stores.knowledge_sources().get(tenant_id, source_id)
    if src is None:
        return None
    if src.get("source_type") == "website" and src.get("url"):
        _delete_chunks(tenant_id, source_id)
        return ingest_website(tenant_id, src["url"])
    src["index_status"] = "reindex_requires_reupload"
    return stores.knowledge_sources().put(tenant_id, src)
