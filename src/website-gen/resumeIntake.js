'use strict';

// Resume → portfolio website.
//
// A user sends their CV/resume as a PDF, Word .docx, or legacy .doc over chat.
// We download it, extract the text, LLM-extract a structured profile, map it to
// the SAME websiteData shape the Flow / chat portfolio paths produce, and kick
// off the proven generateWebsite() build. Anything the resume doesn't yield is
// either asked (the niche, which picks the sub-template) or filled later via the
// normal post-preview revision flow.
//
// Entry point: handleResumeUpload(user, message) — called from
// locationHandler.handleDocument for PDF / DOCX / DOC uploads. Returns true if
// it took over (built / asked the niche), false to fall back to the generic
// document ack (non-resume docs, scanned/unreadable files).

const { logger } = require('../utils/logger');
const { parseProfileLinks } = require('./portfolioLinksParse');

const VALID_NICHES = ['photographer', 'designer', 'developer', 'writer'];

// Which uploaded documents the resume builder will attempt to read. We support
// text-based PDFs (pdf-parse), modern Word .docx (mammoth), and the old binary
// .doc format (word-extractor). Both mime and filename are checked because
// WhatsApp occasionally sends a generic `application/octet-stream` mime with the
// real type only in the filename. `.doc` and `.docx` are kept distinct: the
// .doc filename regex is anchored so it never matches a .docx name.
function isPdfDoc(mime, filename) {
  return /pdf/.test(mime) || /\.pdf$/i.test(filename || '');
}
function isDocxDoc(mime, filename) {
  return /wordprocessingml/.test(mime) || /\.docx$/i.test(filename || '');
}
function isDocDoc(mime, filename) {
  return /msword/.test(mime) || /\.doc$/i.test(filename || '');
}
function isResumeDoc(mime, filename) {
  const m = String(mime || '').toLowerCase();
  return isPdfDoc(m, filename) || isDocxDoc(m, filename) || isDocDoc(m, filename);
}

// PDF buffer → plain text (text-based PDFs). Strips pdf-parse's "-- N of M --"
// page markers. Returns '' on failure / no extractable text (e.g. scanned
// PDFs) so the caller can fall back to the generic document path.
//
// `parseHyperlinks: true` inlines link ANNOTATIONS as Markdown — so a resume
// where "GitHub" / "Portfolio" is clickable text (URL hidden behind it) yields
// `[GitHub](https://github.com/user)` in the text, instead of a bare "GitHub"
// with the URL lost. The LLM extractor + parseProfileLinks then pick up the
// real github/linkedin/behance/project URLs.
async function extractPdfText(buffer) {
  try {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText({ parseHyperlinks: true });
    return String(result?.text || '')
      .replace(/^-{2,}\s*\d+\s+of\s+\d+\s*-{2,}$/gim, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (err) {
    logger.warn(`[RESUME] PDF text extract failed: ${err.message}`);
    return '';
  }
}

// DOCX buffer → plain text. We go via mammoth's HTML conversion (not raw text)
// so hyperlinks behind display text survive: `<a href="URL">GitHub</a>` becomes
// `[GitHub](URL)`, mirroring the PDF path's `parseHyperlinks`. Block tags are
// turned into newlines, the rest stripped, and the few entities mammoth emits
// decoded. Returns '' on failure so the caller falls back to the generic path.
async function extractDocxText(buffer) {
  try {
    const mammoth = require('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer });
    return String(html || '')
      .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, text) => `[${text}](${url})`)
      .replace(/<\/(p|div|li|h[1-6]|tr|table)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (err) {
    logger.warn(`[RESUME] DOCX text extract failed: ${err.message}`);
    return '';
  }
}

// Old binary Word .doc (OLE/CFB) → plain text via word-extractor (mammoth only
// reads .docx). The binary format doesn't expose hyperlink targets behind
// display text the way .docx/PDF do, so URLs only survive if the resume wrote
// them out as literal text — which most do. Returns '' on failure so the caller
// falls back to the generic document path.
async function extractDocText(buffer) {
  try {
    const WordExtractor = require('word-extractor');
    const doc = await new WordExtractor().extract(buffer);
    return String(doc?.getBody() || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (err) {
    logger.warn(`[RESUME] DOC text extract failed: ${err.message}`);
    return '';
  }
}

// Dispatch on document type. Returns '' for anything unsupported, so
// handleResumeUpload bails to the generic document ack. .docx is checked before
// .doc because the .doc filename regex must not win on a .docx name (the mime
// checks are already mutually exclusive).
async function extractResumeText(buffer, mime, filename) {
  const m = String(mime || '').toLowerCase();
  if (isDocxDoc(m, filename)) return extractDocxText(buffer);
  if (isDocDoc(m, filename)) return extractDocText(buffer);
  if (isPdfDoc(m, filename)) return extractPdfText(buffer);
  return '';
}

// Resume text → structured profile via the LLM. `isResume` gates non-resume
// PDFs (invoices, brochures, contracts) back to the generic document path.
async function extractResumeStructure(text, userId) {
  const { generateResponse } = require('../llm/provider');
  const systemPrompt = `You extract a professional's details from a document so we can build their portfolio website.

Return ONLY a JSON object (no commentary, no markdown):
{
  "isResume": <true if this is a CV / resume / professional profile; false for anything else — invoice, brochure, contract, random document>,
  "name": "<full name, or empty string>",
  "niche": "<one of: developer, designer, photographer, writer — best fit for their profession; empty string if genuinely unclear>",
  "aboutText": "<a polished 1-2 sentence THIRD-PERSON professional summary>",
  "skills": ["<clean skill/tool name>", ...],
  "links": "<all profile URLs/handles found, space-separated: github, linkedin, behance, dribbble, instagram, twitter, personal site>",
  "yearsExperience": <integer total years, or null>,
  "currentFocus": "<their current role or what they're working on now, or empty string>",
  "experience": [{"period":"","role":"","company":"","summary":""}],
  "projects": [{"title":"","description":"","role":"","year":"","link":"","tools":["",...]}],
  "email": "<email or empty string>",
  "phone": "<phone or empty string>"
}

Rules:
- niche mapping: software engineer / developer / SWE / data → "developer"; UI/UX / graphic / brand / product designer → "designer"; photographer / videographer → "photographer"; writer / editor / content / copywriter / journalist → "writer". If mixed or unclear, "".
- skills: clean tool/tech names only (max 16), no sentences, no prose.
- yearsExperience: total years of professional experience. If not stated as an explicit number, estimate it from the earliest job start year to the present. null only when the document carries no dates at all.
- experience: ONE entry per job in the work-history/experience section, most-recent first, max 6. Use ONLY jobs actually listed — never invent or pad. period = dates as written (e.g. "Jun 2025 – Present", "2021 – 2024"); role = job title; company = employer/organisation; summary = a 1-2 sentence description of the work/impact (condense bullet points). Empty array if no work history is present.
- projects: 2-6 entries from a projects section (distinct from jobs); short titles, one-line descriptions; empty array if none clearly present.
- If isResume is false, leave the other fields empty/null.
- Output strictly valid JSON.`;
  try {
    const response = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: `Document text:\n${String(text || '').slice(0, 8000)}` }],
      { userId, operation: 'resume_extract', timeoutMs: 25_000 }
    );
    const m = (response || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    logger.warn(`[RESUME] structure extract failed: ${err.message}`);
    return null;
  }
}

// Derive total years of experience from the parsed work-history periods.
// Resumes rarely state a single "N years" figure, so the LLM's yearsExperience
// is unreliable (commonly lowballed to 1). The job date ranges, however, are
// factual — so compute the career span: earliest start year → the latest end
// (or the current year if any role is ongoing). Reads the raw, uncapped
// experience so jobs older than the 6 we display still count toward the span.
// Returns null when no period carries a usable year.
function deriveYearsFromExperience(experience) {
  if (!Array.isArray(experience) || !experience.length) return null;
  const nowYear = new Date().getFullYear();
  let earliest = Infinity;
  let latest = -Infinity;
  let hasPresent = false;
  for (const e of experience) {
    const period = String(e?.period || '');
    if (/present|current|now|ongoing|till\s*date|to\s*date|presente|atual/i.test(period)) hasPresent = true;
    const years = (period.match(/\b(?:19|20)\d{2}\b/g) || [])
      .map((y) => parseInt(y, 10))
      .filter((y) => y >= 1970 && y <= nowYear + 1);
    for (const y of years) {
      if (y < earliest) earliest = y;
      if (y > latest) latest = y;
    }
  }
  if (!Number.isFinite(earliest)) return null;
  const end = hasPresent ? nowYear : Math.max(latest, earliest);
  const span = end - earliest;
  return span > 0 ? span : 1; // any dated role ⇒ at least 1 year
}

// Structured profile → websiteData patch. Mirrors buildWebsiteDataFromFlow's
// portfolio branch (src/flows/intake.js) so the generator produces an
// identical site shape regardless of which intake path was used.
function buildWebsiteDataFromResume(s) {
  const blank = (v) => !v || !String(v).trim();
  const wd = {
    industry: 'Portfolio',
    industryKey: 'portfolio',
    resumeSource: true, // marks this lead as built from an uploaded resume
    services: [],
  };
  if (!blank(s.name)) wd.businessName = String(s.name).trim().slice(0, 80);
  if (!blank(s.aboutText)) wd.aboutText = String(s.aboutText).trim().slice(0, 600);
  const niche = String(s.niche || '').trim().toLowerCase();
  if (VALID_NICHES.includes(niche)) wd.portfolioNiche = niche;
  // Skills → services (drives the skills grid / tech ribbon / terminal stack).
  if (Array.isArray(s.skills)) {
    const skills = s.skills.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 16);
    if (skills.length) wd.services = skills;
  }
  // Profile links → the flat handle keys the templates render
  // (githubHandle / linkedinHandle / twitterHandle / instagramHandle / behanceHandle).
  if (!blank(s.links)) Object.assign(wd, parseProfileLinks(String(s.links)));
  // Years of experience → the "years building" stat. The LLM's number is
  // unreliable (often lowballed to 1), so compute the career span from the
  // factual job periods and take the larger of the two — fixing the resume path
  // showing "1 years building" for someone with a multi-year history. Falls back
  // to whichever source is present when the other is missing.
  const llmYrs = parseInt(s.yearsExperience, 10);
  const derivedYrs = deriveYearsFromExperience(s.experience);
  const yrs = Math.max(
    Number.isFinite(llmYrs) ? llmYrs : 0,
    Number.isFinite(derivedYrs) ? derivedYrs : 0
  );
  if (yrs > 0 && yrs < 80) wd.yearsExperience = yrs;
  // Current focus → hero meta + terminal "building" line.
  if (!blank(s.currentFocus)) wd.currentFocus = String(s.currentFocus).trim().slice(0, 120);
  // Work history → the experience timeline (template shape: period/role/company/
  // summary). Without this the developer template falls back to placeholder jobs.
  if (Array.isArray(s.experience) && s.experience.length) {
    const exp = s.experience.slice(0, 6).map((e) => ({
      period: String(e?.period || '').trim().slice(0, 40),
      role: String(e?.role || '').trim().slice(0, 80),
      company: String(e?.company || '').trim().slice(0, 80),
      summary: String(e?.summary || '').trim().slice(0, 300),
    })).filter((e) => e.role || e.company);
    if (exp.length) wd.experience = exp;
  }
  // Projects → the exact shape the templates consume (photoUrl null → the
  // portfolio image fetcher fills a niche-appropriate Pexels photo).
  if (Array.isArray(s.projects) && s.projects.length) {
    const projects = s.projects.slice(0, 6).map((p) => ({
      title: String(p?.title || '').trim().slice(0, 80),
      description: String(p?.description || '').trim().slice(0, 240),
      role: String(p?.role || '').trim().slice(0, 60),
      year: String(p?.year || '').trim().slice(0, 8),
      link: String(p?.link || '').trim().slice(0, 200),
      tools: Array.isArray(p?.tools) ? p.tools.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8) : [],
      photoUrl: null,
    })).filter((p) => p.title);
    if (projects.length) wd.projects = projects;
  }
  // Contact (resume header).
  if (!blank(s.email)) wd.contactEmail = String(s.email).trim().slice(0, 120);
  if (!blank(s.phone)) wd.contactPhone = String(s.phone).trim().slice(0, 40);
  // Done-flags so the chat portfolio collection (getNextWebState) skips what we
  // already have — used only on the niche-unknown path; harmless otherwise.
  wd.portfolioSkillsDone = true;
  wd.portfolioProfileDone = true;
  wd.aboutSkipped = !wd.aboutText; // if no bio extracted, let the generator auto-write one
  wd.projectsFlowDone = true;
  wd.projectsAskAnswered = true;
  wd.projectsDetailsDone = true;
  return wd;
}

/**
 * Handle a PDF document as a potential resume → portfolio website.
 *
 * @returns {Promise<boolean>} true if handled as a resume (built or asked the
 *   niche); false to fall back to the generic document ack (non-resume PDF,
 *   scanned/unreadable file, or download failure).
 */
async function handleResumeUpload(user, message) {
  const mime = String(message?.mimeType || '').toLowerCase();
  if (!message?.mediaId || !isResumeDoc(mime, message?.filename)) return false;

  // Download the raw document bytes (image-safety checks in downloadMedia only
  // apply to image/* MIME, so a PDF / DOCX passes through untouched).
  let buffer;
  try {
    const { downloadMedia } = require('../messages/sender');
    const media = await downloadMedia(message.mediaId);
    buffer = media?.buffer;
  } catch (err) {
    logger.warn(`[RESUME] download failed: ${err.message}`);
    return false;
  }
  if (!buffer || !buffer.length) return false;

  const text = await extractResumeText(buffer, mime, message?.filename);
  if (!text || text.length < 80) {
    logger.info(`[RESUME] no usable text (len=${text.length}) — falling back to generic doc path`);
    return false; // scanned / empty → not handled here
  }

  const s = await extractResumeStructure(text, user.id);
  if (!s || s.isResume !== true) {
    logger.info(`[RESUME] not a resume (isResume=${s && s.isResume}) — generic doc path`);
    return false;
  }

  const patch = buildWebsiteDataFromResume(s);

  // Merge with any existing websiteData and ensure a site DB record exists
  // (mirrors the Flow intake path) so the preview URL persists and later
  // revisions / domain steps can resolve getLatestSite.
  const { updateUserMetadata, updateUserState } = require('../db/users');
  const prevWd = user.metadata?.websiteData || {};
  const mergedWd = { ...prevWd, ...patch };

  let currentSiteId = user.metadata?.currentSiteId || null;
  if (!currentSiteId) {
    try {
      const { createSite } = require('../db/sites');
      const site = await createSite(user.id, 'business-starter');
      currentSiteId = site.id;
    } catch (err) {
      logger.warn(`[RESUME] createSite failed: ${err.message}`);
    }
  }

  await updateUserMetadata(user.id, {
    websiteData: mergedWd,
    websiteDemoTriggered: true,
    currentSiteId,
    email: patch.contactEmail || user.metadata?.email || null,
  });
  user.metadata = { ...(user.metadata || {}), websiteData: mergedWd, websiteDemoTriggered: true, currentSiteId };

  const { sendTextMessage } = require('../messages/sender');
  const niceName = patch.businessName ? ` for *${patch.businessName}*` : '';

  logger.info(`[RESUME] parsed niche=${patch.portfolioNiche || '?'} skills=${patch.services.length} projects=${(patch.projects || []).length} → ${user.phone_number}`);

  // Niche unknown → ask it (it picks the sub-template). Everything else is
  // pre-filled + done-flagged, so the existing WEB_COLLECT_PORTFOLIO_NICHE
  // handler advances straight to the build once they answer.
  if (!patch.portfolioNiche) {
    const { STATES } = require('../conversation/states');
    await updateUserState(user.id, STATES.WEB_COLLECT_PORTFOLIO_NICHE);
    user.state = STATES.WEB_COLLECT_PORTFOLIO_NICHE;
    await sendTextMessage(
      user.phone_number,
      `Read your resume${niceName} ✅ — got your skills, experience and projects.\n\nOne quick thing so I pick the right design: what best describes your work — *developer*, *designer*, *photographer*, or *writer*?`
    );
    return true;
  }

  await sendTextMessage(
    user.phone_number,
    `Read your resume${niceName} ✅ — pulling your skills, experience and projects into a *${patch.portfolioNiche}* portfolio now. Takes a few seconds; I'll send the preview link. ✨`
  );

  try {
    const { generateWebsite } = require('../conversation/handlers/webDev');
    await generateWebsite(user);
  } catch (err) {
    logger.error(`[RESUME] generateWebsite failed: ${err.message}`);
    await sendTextMessage(user.phone_number, "Hmm — something tripped while building. Give me a moment, or say *try again*.");
  }
  return true;
}

module.exports = {
  extractResumeText,
  extractResumeStructure,
  buildWebsiteDataFromResume,
  handleResumeUpload,
  isResumeDoc,
};
