'use strict';

// Parse a free-text blob of profile links into the username-only handle
// fields the portfolio templates consume (they each build the full URL, e.g.
// `https://github.com/${githubHandle}`). Pure shape detection — no LLM — so
// the chat collection step (webDev) and the Meta Flow intake (intake.js) turn
// the same paste into the same handles.
//
// Returns only the keys that were found:
//   { githubHandle, linkedinHandle, twitterHandle, instagramHandle, behanceHandle }
//
// Accepts both pasted URLs ("github.com/foo", "https://www.linkedin.com/in/foo/")
// and labelled handles ("github: foo", "insta @foo", "behance bar").

// A platform username: letters/digits/dot/dash/underscore. LinkedIn allows a
// trailing slug; we keep the first path segment only.
const HANDLE = '[A-Za-z0-9._-]+';

// Path segments that are never a username (platform sub-pages). If the first
// segment after the domain is one of these, we skip it rather than store junk.
const STOP_SEGMENTS = new Set([
  'in', 'pub', 'company', 'school', 'feed', 'home', 'explore', 'search',
  'p', 'reel', 'reels', 'stories', 'tv', 'about', 'login', 'signup', 'i',
  'sharing', 'gallery', 'collection', 'orgs', 'sponsors', 'settings',
]);

// Pull the username out of a captured tail (URL path or bare handle).
function cleanHandle(raw) {
  let h = String(raw || '').trim();
  if (!h) return '';
  h = h.replace(/^@+/, '');                 // strip leading @
  h = h.split(/[?#]/)[0];                    // drop query / fragment
  h = h.replace(/\/+$/, '');                 // drop trailing slashes
  h = h.split('/')[0];                       // first path segment only
  h = h.replace(/[).,;:!?"'»]+$/, '');       // strip trailing punctuation
  if (!h || /^https?$/i.test(h)) return '';
  if (!new RegExp(`^${HANDLE}$`).test(h)) return '';
  return h.slice(0, 60);
}

// LinkedIn keeps a profile under /in/<slug> or /pub/<slug>; the slug is the
// segment AFTER that prefix. Bare "linkedin.com/foo" also works.
function cleanLinkedin(rest) {
  let r = String(rest || '').trim().replace(/^\/+/, '');
  const m = r.match(/^(?:in|pub)\/([A-Za-z0-9._-]+)/i);
  if (m) return cleanHandle(m[1]);
  return cleanHandle(r);
}

function firstMatch(text, re, clean) {
  const m = text.match(re);
  if (!m) return '';
  return (clean || cleanHandle)(m[1]);
}

function parseProfileLinks(input) {
  const text = String(input || '');
  if (!text.trim()) return {};
  const out = {};

  // Drop a captured segment that's actually a platform sub-page (e.g.
  // instagram.com/p/<postid>, twitter.com/i/...) rather than a username.
  const keep = (h) => (h && !STOP_SEGMENTS.has(h.toLowerCase()) ? h : '');

  // ── URL forms (most common when someone pastes links) ──────────────────
  const github = keep(firstMatch(text, /github\.com\/([^\s,]+)/i));
  const linkedin =
    firstMatch(text, /linkedin\.com\/((?:in|pub)\/[^\s,]+|[^\s,]+)/i, cleanLinkedin);
  const twitter = keep(firstMatch(text, /(?:twitter\.com|x\.com)\/([^\s,]+)/i));
  const instagram = keep(firstMatch(text, /(?:instagram\.com|instagr\.am)\/([^\s,]+)/i));
  const behance = keep(firstMatch(text, /behance\.net\/([^\s,]+)/i));

  if (github) out.githubHandle = github;
  if (linkedin) out.linkedinHandle = linkedin;
  if (twitter) out.twitterHandle = twitter;
  if (instagram) out.instagramHandle = instagram;
  if (behance) out.behanceHandle = behance;

  // ── Labelled handles ("github: foo", "ig @foo") — only fill gaps the
  //    URL pass didn't already cover, so a pasted URL always wins. ────────
  // The `(?!\.)` after each platform word skips a domain ("instagram.com/…",
  // already handled by the URL pass); the handle must START with an
  // alphanumeric (so a stray ".com" can never be captured). Twitter/X requires
  // an explicit @ since "x" is too common a letter to match bare.
  const H = '[A-Za-z0-9_-][A-Za-z0-9._-]*';
  // SEP requires an explicit ":"/"-" or an "@" before the handle, so a bare
  // "my github is torvalds" doesn't capture the filler word "is". Pasted URLs
  // (the common case) are already covered by the URL pass above.
  const SEP = '(?:\\s*[:\\-]\\s*@?|\\s*@)';
  const labelled = [
    ['githubHandle', new RegExp(`\\bgithub\\b(?!\\.)${SEP}(${H})`, 'i')],
    ['linkedinHandle', new RegExp(`\\blinked\\s?in\\b(?!\\.)${SEP}(?:in/)?(${H})`, 'i')],
    ['twitterHandle', new RegExp(`\\b(?:twitter|x)\\b(?!\\.)\\s*[:\\-]?\\s*@(${H})`, 'i')],
    ['instagramHandle', new RegExp(`\\b(?:instagram|insta|ig)\\b(?!\\.)${SEP}(${H})`, 'i')],
    ['behanceHandle', new RegExp(`\\bbehance\\b(?!\\.)${SEP}(${H})`, 'i')],
  ];
  for (const [key, re] of labelled) {
    if (out[key]) continue;
    const h = firstMatch(text, re);
    // Guard: don't capture the platform word itself or a stop-segment.
    if (h && !STOP_SEGMENTS.has(h.toLowerCase())) out[key] = h;
  }

  return out;
}

module.exports = { parseProfileLinks, cleanHandle };
