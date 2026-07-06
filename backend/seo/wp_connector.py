"""Real WordPress connector via the REST API + application passwords.

verify_wordpress: confirm the credentials work (GET /wp-json/wp/v2/users/me).
apply_fix: apply an approved SEO fix to the live site. Core REST reliably owns
post/page title + excerpt; SEO-plugin fields (Yoast/RankMath meta description,
OG) are attempted via registered post meta and, if the site doesn't expose them,
returned as `unsupported` with a clear message (a Pixie WP plugin can add them
later) — never faked. Every apply returns old_value + new_value.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx

_UA = "PixieSEO/1.0"


def normalize_base(site_url: str) -> str:
    """Turn whatever the user pasted (admin URL, trailing slash, path) into the WP
    REST root. `https://site.com/wp-admin/` → `https://site.com`."""
    u = (site_url or "").strip().rstrip("/")
    for suffix in ("/wp-admin", "/wp-login.php", "/wp-json"):
        if u.lower().endswith(suffix):
            u = u[: -len(suffix)]
    # also drop a deeper /wp-admin/... path if present
    low = u.lower()
    if "/wp-admin" in low:
        u = u[: low.index("/wp-admin")]
    return u.rstrip("/")


def _client(site_url: str, username: str, app_password: str) -> httpx.Client:
    return httpx.Client(base_url=normalize_base(site_url), timeout=25,
                        auth=(username, app_password.replace(" ", "")),
                        headers={"User-Agent": _UA})


def verify_wordpress(site_url: str, username: str, app_password: str) -> dict:
    try:
        with _client(site_url, username, app_password) as c:
            r = c.get("/wp-json/wp/v2/users/me", params={"context": "edit"})
        if r.status_code == 200:
            me = r.json()
            return {"status": "ok", "connected_as": me.get("name") or me.get("slug"),
                    "caps": list((me.get("capabilities") or {}).keys())[:5]}
        if r.status_code in (401, 403):
            code, wp_msg = "", ""
            try:
                j = r.json()
                code, wp_msg = j.get("code", ""), j.get("message", "")
            except Exception:
                pass
            hint = {
                "incorrect_password": "The application password is wrong — regenerate it in WP Admin → Users → Profile → Application Passwords and paste the new one.",
                "invalid_username": "The username is wrong — use your WordPress login username or account email, not the display name.",
                "rest_not_logged_in": "Your host is stripping the Authorization header. Add to .htaccess: SetEnvIf Authorization \"(.*)\" HTTP_AUTHORIZATION=$1",
                "application_passwords_disabled": "Application Passwords are disabled — your site must be HTTPS and the feature enabled (some security plugins turn it off).",
                "rest_cannot_access": "A security plugin (Wordfence/iThemes) is blocking the REST API. Allow /wp-json for authenticated requests.",
            }.get(code, "")
            if not hint and r.status_code == 403:
                hint = "A security plugin or firewall is likely blocking the REST API (/wp-json)."
            return {"status": "auth_failed", "wp_status": r.status_code, "wp_code": code,
                    "message": f"WordPress rejected the login ({r.status_code}"
                               f"{': ' + code if code else ''}). {hint or wp_msg or 'Check the username and application password.'}"}
        if r.status_code == 404:
            return {"status": "error",
                    "message": "REST API not found (404). Set Settings → Permalinks to 'Post name', "
                               "or your site has the REST API disabled."}
        return {"status": "error", "message": f"WordPress returned {r.status_code}. Is the REST API enabled?"}
    except Exception as exc:
        return {"status": "error", "message": f"Could not reach {site_url}: {exc}"}


def _find_object(c: httpx.Client, page_url: str):
    """Locate the post/page for a URL by its slug. Returns (kind, obj) or (None, None)."""
    slug = [seg for seg in urlsplit(page_url).path.split("/") if seg]
    slug = slug[-1] if slug else ""
    if not slug:
        return None, None
    for kind in ("pages", "posts"):
        r = c.get(f"/wp-json/wp/v2/{kind}", params={"slug": slug, "context": "edit"})
        if r.status_code == 200 and r.json():
            return kind, r.json()[0]
    return None, None


def apply_fix(connection: dict, issue: dict, new_value: str) -> dict:
    """Apply one SEO fix. Returns {status, old_value, new_value, field, ...}."""
    site = connection.get("site_url", "")
    user = connection.get("username", "")
    pw = connection.get("application_password", "")
    engine_id = (issue.get("recommended_fix_json") or {}).get("engine_id", "") or ""
    category = issue.get("category", "")

    try:
        with _client(site, user, pw) as c:
            kind, obj = _find_object(c, issue.get("page_url", ""))
            if not obj:
                return {"status": "error", "error": "page_not_found",
                        "message": "Could not find that page/post in WordPress by its slug."}
            oid = obj["id"]

            # Title fixes → post/page title (core REST, reliable).
            if engine_id.startswith("meta.title") or category == "meta" and "title" in engine_id:
                old = (obj.get("title") or {}).get("raw", "")
                r = c.post(f"/wp-json/wp/v2/{kind}/{oid}", json={"title": new_value})
                if r.status_code >= 300:
                    return {"status": "error", "error": "api_error", "message": r.text[:200]}
                return {"status": "success", "provider": "wordpress", "field": "title",
                        "old_value": old, "new_value": new_value, "object": f"{kind}/{oid}"}

            # Meta description → try Yoast/RankMath post meta; unsupported if not exposed.
            if engine_id.startswith("meta.description"):
                for meta_key in ("_yoast_wpseo_metadesc", "rank_math_description"):
                    r = c.post(f"/wp-json/wp/v2/{kind}/{oid}", json={"meta": {meta_key: new_value}})
                    if r.status_code < 300 and (r.json().get("meta", {}).get(meta_key) == new_value):
                        return {"status": "success", "provider": "wordpress", "field": meta_key,
                                "old_value": "", "new_value": new_value, "object": f"{kind}/{oid}"}
                return {"status": "unsupported", "provider": "wordpress", "error": "seo_field_not_writable",
                        "message": "This site doesn't expose the SEO meta description over REST. "
                                   "Copy the fix into your SEO plugin, or install the Pixie WP plugin."}

            return {"status": "unsupported", "provider": "wordpress", "error": "not_supported_yet",
                    "message": f"One-tap apply for '{category}' isn't wired for WordPress yet — copy the fix for now."}
    except Exception as exc:
        return {"status": "error", "error": "exception", "message": str(exc)[:200]}
