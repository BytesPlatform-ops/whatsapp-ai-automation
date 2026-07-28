/**
 * Realistic mock response factories for Pixie Lab SEO proxy routes.
 *
 * All shapes match the Envelope<T> contract from servicesClient.ts:
 *   { backendUp: true, ...data }  — success
 *   { backendUp: false }          — backend offline
 *
 * Scales used for pagination stress tests:
 *   1 000 pages, 5 000 keywords, 50 000 backlinks, 5 000 citations, 10 000 contacts
 * Responses are paginated so panels never need to render all rows at once.
 */

import type { Page, Route } from 'playwright/test';

/* ── Shared IDs ─────────────────────────────────────────────────────── */
export const SITE_ID   = 'site-test-001';
export const CRAWL_ID  = 'crawl-test-001';
export const PROJ_ID   = 'proj-test-001';
export const LOC_ID    = 'loc-test-001';

/* ── Helpers ─────────────────────────────────────────────────────────── */
function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Generator utilities ─────────────────────────────────────────────── */

/** Generate `count` paginated pages (limit/offset-aware). */
export function makePages(total: number, offset: number, limit: number) {
  const slice = range(Math.min(limit, Math.max(0, total - offset)));
  return {
    backendUp: true,
    pages: slice.map((i) => ({
      id: `page-${offset + i}`,
      site_id: SITE_ID,
      crawl_job_id: CRAWL_ID,
      url: `https://example.com/page-${offset + i}`,
      title: `Page title ${offset + i}`,
      status_code: pick([200, 301, 404]),
      indexability: pick(['indexable', 'noindex', 'canonical-redirect']),
      word_count: 300 + ((offset + i) % 800),
      response_time_ms: 120 + ((offset + i) % 500),
      crawled_at: new Date(Date.now() - i * 60_000).toISOString(),
    })),
    total,
    offset,
    limit,
  };
}

/** Generate `count` paginated keywords. */
export function makeKeywords(total: number, offset: number, limit: number) {
  const slice = range(Math.min(limit, Math.max(0, total - offset)));
  return {
    backendUp: true,
    keywords: slice.map((i) => ({
      id: `kw-${offset + i}`,
      keyword: `keyword phrase ${offset + i}`,
      search_volume: 100 + ((offset + i) * 17) % 10_000,
      difficulty: (offset + i) % 100,
      intent: pick(['informational', 'commercial', 'transactional', 'navigational']),
      current_rank: (offset + i) % 4 === 0 ? null : 1 + ((offset + i) % 100),
      previous_rank: (offset + i) % 4 === 0 ? null : 1 + ((offset + i + 3) % 100),
      cpc: (offset + i % 5) * 0.4,
    })),
    total,
    offset,
    limit,
  };
}

/** Generate `count` paginated backlinks. */
export function makeBacklinks(total: number, offset: number, limit: number) {
  const slice = range(Math.min(limit, Math.max(0, total - offset)));
  return {
    backendUp: true,
    backlinks: slice.map((i) => ({
      id: `bl-${offset + i}`,
      source_domain: `domain${(offset + i) % 1000}.com`,
      source_url: `https://domain${(offset + i) % 1000}.com/post-${offset + i}`,
      target_url: `https://example.com/page-${(offset + i) % 200}`,
      anchor_text: `anchor text ${offset + i}`,
      follow: (offset + i) % 3 !== 0,
      status: pick(['active', 'lost']),
      risk: pick([null, 'low', 'medium', 'high']),
      domain_rating: (offset + i) % 100,
      first_seen: new Date(Date.now() - (offset + i) * 86_400_000).toISOString(),
    })),
    total,
    offset,
    limit,
  };
}

/** Generate `count` paginated citations. */
export function makeCitations(total: number, offset: number, limit: number) {
  const slice = range(Math.min(limit, Math.max(0, total - offset)));
  const dirs = ['Google', 'Yelp', 'Bing Places', 'Apple Maps', 'TripAdvisor', 'Yellow Pages'];
  return {
    backendUp: true,
    citations: slice.map((i) => ({
      id: `cit-${offset + i}`,
      directory: pick(dirs),
      listing_url: `https://${pick(dirs).toLowerCase().replace(/ /g, '')}.com/biz/${offset + i}`,
      name_on_listing: 'Acme Corp',
      address_on_listing: `${offset + i} Main St`,
      phone_on_listing: `555-${String(offset + i).padStart(4, '0')}`,
      consistent: pick([true, false, null]),
      claimed: pick([true, false]),
      last_checked_at: new Date(Date.now() - i * 3_600_000).toISOString(),
    })),
    total,
    offset,
    limit,
  };
}

/** Generate `count` paginated outreach contacts. */
export function makeContacts(total: number, offset: number, limit: number) {
  const slice = range(Math.min(limit, Math.max(0, total - offset)));
  return {
    backendUp: true,
    contacts: slice.map((i) => ({
      id: `contact-${offset + i}`,
      name: `Contact Name ${offset + i}`,
      email: `contact${offset + i}@domain.com`,
      domain: `domain${(offset + i) % 500}.com`,
      status: pick(['active', 'suppressed', 'bounced']),
    })),
    total,
    offset,
    limit,
  };
}

/* ── Static mock envelopes ──────────────────────────────────────────── */

export const MOCK_SITES = {
  backendUp: true,
  sites: [
    {
      id: SITE_ID,
      domain: 'example.com',
      display_name: 'Example Site',
      connection_status: 'connected',
      crawl_frequency: 'weekly',
      country: 'US',
      language: 'en',
      created_at: '2025-01-01T00:00:00Z',
    },
  ],
};

export const MOCK_CRAWL_JOBS = {
  backendUp: true,
  crawl_jobs: [
    {
      id: CRAWL_ID,
      site_id: SITE_ID,
      status: 'completed',
      crawl_type: 'site',
      discovered_count: 1000,
      crawled_count: 1000,
      failed_count: 2,
      progress: 100,
      queued_at: '2025-01-10T10:00:00Z',
      started_at: '2025-01-10T10:01:00Z',
      finished_at: '2025-01-10T10:45:00Z',
    },
  ],
};

export const MOCK_CRAWL_PROGRESS = {
  backendUp: true,
  crawl_job: {
    id: CRAWL_ID,
    site_id: SITE_ID,
    status: 'running',
    crawl_type: 'site',
    discovered_count: 450,
    crawled_count: 300,
    failed_count: 0,
    progress: 30,
    queued_at: '2025-01-10T10:00:00Z',
    started_at: '2025-01-10T10:01:00Z',
  },
};

export const MOCK_ISSUES = {
  backendUp: true,
  issues: [
    {
      id: 'issue-001',
      site_id: SITE_ID,
      crawl_job_id: CRAWL_ID,
      rule_key: 'missing_meta_description',
      category: 'on_page',
      severity: 'high',
      status: 'open',
      recommendation: 'Add a meta description of 120-160 characters.',
      fix_mode: 'copy_ready',
      page_id: 'https://example.com/about',
    },
    {
      id: 'issue-002',
      site_id: SITE_ID,
      crawl_job_id: CRAWL_ID,
      rule_key: 'duplicate_title',
      category: 'on_page',
      severity: 'medium',
      status: 'open',
      recommendation: 'Ensure each page has a unique title tag.',
      fix_mode: 'manual_only',
    },
    {
      id: 'issue-003',
      site_id: SITE_ID,
      crawl_job_id: CRAWL_ID,
      rule_key: 'slow_page_load',
      category: 'performance',
      severity: 'critical',
      status: 'open',
      recommendation: 'Improve server response time and asset caching.',
      fix_mode: 'manual_only',
    },
  ],
};

export const MOCK_REPORT = {
  backendUp: true,
  report: {
    id: 'report-001',
    site_id: SITE_ID,
    crawl_job_id: CRAWL_ID,
    generated_at: '2025-01-10T11:00:00Z',
    summary: {
      total_pages: 1000,
      issues_critical: 3,
      issues_high: 12,
      issues_medium: 25,
      issues_low: 40,
      score: 72,
    },
  },
};

export const MOCK_KEYWORD_PROJECTS = {
  backendUp: true,
  projects: [
    {
      id: PROJ_ID,
      name: 'Main Keyword Project',
      keyword_count: 5000,
      created_at: '2025-01-01T00:00:00Z',
    },
  ],
};

export const MOCK_RESEARCH_KEYWORDS = {
  backendUp: true,
  keywords: [
    { keyword: 'seo tools', search_volume: 12000, difficulty: 62 },
    { keyword: 'keyword research', search_volume: 9500, difficulty: 58 },
    { keyword: 'rank tracker', search_volume: 5400, difficulty: 45 },
  ],
};

export const MOCK_RANK_OVERVIEW = {
  backendUp: true,
  top_3: 12,
  top_10: 87,
  top_100: 320,
  not_ranked: 80,
};

export const MOCK_RANK_CHECK = {
  backendUp: true,
  status: 'queued',
};

export const MOCK_BACKLINK_OVERVIEW = {
  backendUp: true,
  overview: {
    total_backlinks: 50000,
    referring_domains: 1200,
    new_last_30d: 87,
    lost_last_30d: 23,
    follow_count: 38000,
    nofollow_count: 12000,
  },
};

export const MOCK_REFERRING_DOMAINS = {
  backendUp: true,
  domains: range(20).map((i) => ({
    domain: `referrer${i}.com`,
    backlink_count: 50 - i * 2,
    follow_count: 30 - i,
    nofollow_count: 10,
    domain_rating: 80 - i * 3,
    first_seen: '2024-06-01T00:00:00Z',
  })),
};

export const MOCK_NEW_LOST = {
  backendUp: true,
  new: range(5).map((i) => ({
    id: `new-bl-${i}`,
    source_domain: `newref${i}.com`,
    target_url: 'https://example.com/',
    anchor_text: `new anchor ${i}`,
    follow: true,
    status: 'active',
    first_seen: new Date().toISOString(),
  })),
  lost: range(3).map((i) => ({
    id: `lost-bl-${i}`,
    source_domain: `lostref${i}.com`,
    target_url: 'https://example.com/',
    anchor_text: `lost anchor ${i}`,
    follow: false,
    status: 'lost',
    first_seen: '2024-01-01T00:00:00Z',
  })),
};

export const MOCK_ANCHORS = {
  backendUp: true,
  anchors: [
    { anchor: 'click here', count: 450 },
    { anchor: 'example.com', count: 320 },
    { anchor: 'read more', count: 180 },
  ],
};

export const MOCK_BACKLINK_SYNC = { backendUp: true, status: 'queued' };
export const MOCK_EXPORT_BACKLINKS = { backendUp: true, csv: 'source_domain,anchor_text\ndomain1.com,test\n' };

export const MOCK_LOCATIONS = {
  backendUp: true,
  locations: [
    {
      id: LOC_ID,
      name: 'Main Branch',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      phone: '555-0100',
    },
  ],
};

export const MOCK_REVIEWS = {
  backendUp: true,
  reviews: range(5).map((i) => ({
    id: `review-${i}`,
    location_id: LOC_ID,
    platform: pick(['google', 'yelp']),
    rating: 3 + (i % 3),
    text: `Review text for review ${i}. Great service!`,
    reviewer_name: `Reviewer ${i}`,
    created_at: new Date(Date.now() - i * 86_400_000 * 7).toISOString(),
    reply_text: i % 2 === 0 ? 'Thank you for your review!' : null,
  })),
};

export const MOCK_LOCAL_OVERVIEW = {
  backendUp: true,
  overview: {
    location_id: LOC_ID,
    average_rating: 4.3,
    total_reviews: 127,
    unanswered_reviews: 12,
    nap_score: 85,
    citations_consistent: 42,
    citations_inconsistent: 8,
  },
};

export const MOCK_GBP_CONNECT = { backendUp: true, status: 'connected', auth_url: null };
export const MOCK_GBP_SYNC = { backendUp: true, status: 'syncing' };

export const MOCK_OUTREACH_CAMPAIGNS = {
  backendUp: true,
  campaigns: [
    {
      id: 'camp-001',
      name: 'Q1 Link Building',
      status: 'active',
      contact_count: 45,
      sent_count: 38,
      reply_count: 7,
      created_at: '2025-01-01T00:00:00Z',
    },
  ],
};

export const MOCK_OUTREACH_DRAFTS = {
  backendUp: true,
  drafts: [
    {
      id: 'draft-001',
      campaign_id: 'camp-001',
      contact_id: 'contact-0',
      subject: 'Link Building Opportunity',
      body: 'Hi, I noticed your website...',
      status: 'draft',
      created_at: '2025-01-05T09:00:00Z',
    },
  ],
};

export const MOCK_DRAFT_SEND = { backendUp: true, status: 'sent', draft_id: 'draft-001' };
export const MOCK_DRAFT_APPROVE = { backendUp: true, status: 'approved' };
export const MOCK_STOP_FOLLOWUP = { backendUp: true, status: 'stopped' };

export const MOCK_BILLING_USAGE = {
  plan: 'SEO Pro',
  period_start: '2025-01-01',
  period_end: '2025-01-31',
  meters: [
    { name: 'Crawl Pages', used: 8500, limit: 10000, unit: 'pages' },
    { name: 'Keyword Checks', used: 2300, limit: 5000, unit: 'checks' },
    { name: 'Backlink Syncs', used: 3, limit: 10, unit: 'syncs' },
  ],
};

export const MOCK_CONNECTIONS = {
  backendUp: true,
  platforms: [
    { platform: 'wordpress', status: 'connected', connected_as: 'admin' },
    { platform: 'google_search_console', status: 'disconnected' },
  ],
};

export const MOCK_GOOGLE_PROPERTIES = {
  backendUp: true,
  properties: [
    { property_uri: 'sc-domain:example.com', display_name: 'example.com', type: 'domain' },
    { property_uri: 'https://example.com/', display_name: 'https://example.com/', type: 'url_prefix' },
  ],
};

export const MOCK_RESOLVE_ISSUE = { backendUp: true, status: 'resolved' };
export const MOCK_PREPARE_FIX = {
  backendUp: true,
  status: 'copy_ready',
  copy_text: 'Acme Corp — Premium widget solutions for modern businesses.',
};

export const MOCK_CREATE_CAMPAIGN = { backendUp: true, campaign: { id: 'camp-new', name: 'New Campaign', status: 'draft' } };
export const MOCK_SUPPRESS_CONTACT = { backendUp: true, status: 'suppressed' };
export const MOCK_NAP_AUDIT = {
  backendUp: true,
  audit: {
    location_id: LOC_ID,
    nap_score: 85,
    issues: [
      { field: 'phone', issue: 'Inconsistent format across directories' },
    ],
    checked_at: new Date().toISOString(),
  },
};

/* ── Provider-offline helpers ─────────────────────────────────────────── */
export const BACKEND_OFFLINE = { backendUp: false };

/* ── Route installer ─────────────────────────────────────────────────── */

export type MockConfig = {
  backendUp?: boolean;
  /** Pages total (for pagination test). Default 50. */
  pagesTotal?: number;
  /** Keywords total (for pagination test). Default 20. */
  keywordsTotal?: number;
  /** Backlinks total. Default 10. */
  backlinksTotal?: number;
  /** Citations total. Default 10. */
  citationsTotal?: number;
  /** Contacts total. Default 10. */
  contactsTotal?: number;
};

/**
 * Install route mocks on the given Playwright page. Every /api/lab/seo/*
 * request is intercepted and fulfilled with realistic mock data.
 * Nothing reaches the real backend.
 */
export async function installSeoMocks(page: Page, cfg: MockConfig = {}): Promise<void> {
  const up = cfg.backendUp !== false;
  const pagesTotal = cfg.pagesTotal ?? 50;
  const kTotal = cfg.keywordsTotal ?? 20;
  const blTotal = cfg.backlinksTotal ?? 10;
  const citTotal = cfg.citationsTotal ?? 10;
  const ctTotal = cfg.contactsTotal ?? 10;

  async function fulfill(route: Route, body: unknown) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(up ? body : BACKEND_OFFLINE),
    });
  }

  /* Sites */
  await page.route('**/api/lab/seo/sites', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_SITES);
    else await fulfill(r, { backendUp: true, site: MOCK_SITES.sites[0] });
  });
  await page.route('**/api/lab/seo/sites/**', async (r) => {
    await fulfill(r, { backendUp: true, site: MOCK_SITES.sites[0] });
  });

  /* Crawl jobs */
  await page.route('**/api/lab/seo/crawls', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_CRAWL_JOBS);
    else await fulfill(r, { backendUp: true, crawl_job: MOCK_CRAWL_PROGRESS.crawl_job });
  });
  await page.route('**/api/lab/seo/crawls/**', async (r) => {
    await fulfill(r, MOCK_CRAWL_PROGRESS);
  });

  /* Pages — paginated */
  await page.route('**/api/lab/seo/pages**', async (r) => {
    const url = new URL(r.request().url());
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    await fulfill(r, makePages(pagesTotal, offset, limit));
  });

  /* Issues */
  await page.route('**/api/lab/seo/issues**', async (r) => {
    await fulfill(r, MOCK_ISSUES);
  });

  /* Reports */
  await page.route('**/api/lab/seo/reports**', async (r) => {
    await fulfill(r, MOCK_REPORT);
  });

  /* Keyword projects */
  await page.route('**/api/lab/seo/keyword-projects**', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_KEYWORD_PROJECTS);
    else await fulfill(r, { backendUp: true, project: MOCK_KEYWORD_PROJECTS.projects[0] });
  });

  /* Keywords — paginated */
  await page.route('**/api/lab/seo/keywords**', async (r) => {
    const method = r.request().method();
    if (method === 'POST') {
      await fulfill(r, { backendUp: true, keyword: { id: 'kw-new', keyword: 'new keyword' } });
    } else if (method === 'DELETE') {
      await fulfill(r, { backendUp: true, status: 'deleted' });
    } else {
      const url = new URL(r.request().url());
      const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      await fulfill(r, makeKeywords(kTotal, offset, limit));
    }
  });

  /* Research */
  await page.route('**/api/lab/seo/research**', async (r) => {
    await fulfill(r, MOCK_RESEARCH_KEYWORDS);
  });

  /* Export keywords CSV */
  await page.route('**/api/lab/seo/keywords/export**', async (r) => {
    await fulfill(r, { backendUp: true, csv: 'keyword,volume\ntest,100\n' });
  });

  /* Rankings */
  await page.route('**/api/lab/seo/rankings**', async (r) => {
    if (r.request().method() === 'POST') await fulfill(r, MOCK_RANK_CHECK);
    else await fulfill(r, MOCK_RANK_OVERVIEW);
  });

  /* Rank overview */
  await page.route('**/api/lab/seo/rank-overview**', async (r) => {
    await fulfill(r, MOCK_RANK_OVERVIEW);
  });

  /* Rank history */
  await page.route('**/api/lab/seo/rank-history**', async (r) => {
    await fulfill(r, { backendUp: true, history: [] });
  });

  /* Opportunities */
  await page.route('**/api/lab/seo/opportunities**', async (r) => {
    await fulfill(r, { backendUp: true, opportunities: [] });
  });

  /* Optimise / briefs */
  await page.route('**/api/lab/seo/optimize**', async (r) => {
    await fulfill(r, MOCK_PREPARE_FIX);
  });
  await page.route('**/api/lab/seo/briefs**', async (r) => {
    await fulfill(r, { backendUp: true, briefs: [] });
  });

  /* Backlinks — paginated */
  await page.route('**/api/lab/seo/backlinks**', async (r) => {
    const url = new URL(r.request().url());
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    await fulfill(r, makeBacklinks(blTotal, offset, limit));
  });

  /* Backlink sub-routes */
  await page.route('**/api/lab/seo/backlink-overview**', async (r) => {
    await fulfill(r, MOCK_BACKLINK_OVERVIEW);
  });
  await page.route('**/api/lab/seo/referring-domains**', async (r) => {
    await fulfill(r, MOCK_REFERRING_DOMAINS);
  });
  await page.route('**/api/lab/seo/backlinks-new-lost**', async (r) => {
    await fulfill(r, MOCK_NEW_LOST);
  });
  await page.route('**/api/lab/seo/anchor-texts**', async (r) => {
    await fulfill(r, MOCK_ANCHORS);
  });
  await page.route('**/api/lab/seo/backlink-sync**', async (r) => {
    await fulfill(r, MOCK_BACKLINK_SYNC);
  });
  await page.route('**/api/lab/seo/backlinks/export**', async (r) => {
    await fulfill(r, MOCK_EXPORT_BACKLINKS);
  });

  /* Citations — paginated */
  await page.route('**/api/lab/seo/citations**', async (r) => {
    const url = new URL(r.request().url());
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    await fulfill(r, makeCitations(citTotal, offset, limit));
  });
  await page.route('**/api/lab/seo/citations/check**', async (r) => {
    await fulfill(r, { backendUp: true, status: 'checking' });
  });
  await page.route('**/api/lab/seo/citations/export**', async (r) => {
    await fulfill(r, { backendUp: true, csv: 'directory,consistent\nGoogle,true\n' });
  });
  await page.route('**/api/lab/seo/citations/import**', async (r) => {
    await fulfill(r, { backendUp: true, imported: 5 });
  });

  /* Local */
  await page.route('**/api/lab/seo/local-overview**', async (r) => {
    await fulfill(r, MOCK_LOCAL_OVERVIEW);
  });
  await page.route('**/api/lab/seo/locations**', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_LOCATIONS);
    else await fulfill(r, { backendUp: true, location: MOCK_LOCATIONS.locations[0] });
  });
  await page.route('**/api/lab/seo/locations/**', async (r) => {
    await fulfill(r, { backendUp: true, location: MOCK_LOCATIONS.locations[0] });
  });
  await page.route('**/api/lab/seo/reviews**', async (r) => {
    await fulfill(r, MOCK_REVIEWS);
  });
  await page.route('**/api/lab/seo/review-summary**', async (r) => {
    await fulfill(r, { backendUp: true, summary: { average_rating: 4.3, total: 127 } });
  });
  await page.route('**/api/lab/seo/review-reply**', async (r) => {
    await fulfill(r, { backendUp: true, status: 'replied' });
  });
  await page.route('**/api/lab/seo/nap-audit**', async (r) => {
    await fulfill(r, MOCK_NAP_AUDIT);
  });
  await page.route('**/api/lab/seo/local-rankings**', async (r) => {
    await fulfill(r, { backendUp: true, rankings: [] });
  });
  await page.route('**/api/lab/seo/gbp-connect**', async (r) => {
    await fulfill(r, MOCK_GBP_CONNECT);
  });
  await page.route('**/api/lab/seo/gbp-sync**', async (r) => {
    await fulfill(r, MOCK_GBP_SYNC);
  });

  /* Outreach contacts — paginated */
  await page.route('**/api/lab/seo/outreach-contacts**', async (r) => {
    if (r.request().method() === 'GET') {
      const url = new URL(r.request().url());
      const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
      await fulfill(r, makeContacts(ctTotal, offset, limit));
    } else {
      await fulfill(r, MOCK_SUPPRESS_CONTACT);
    }
  });
  await page.route('**/api/lab/seo/outreach-contacts/export**', async (r) => {
    await fulfill(r, { backendUp: true, csv: 'name,email\nTest,test@test.com\n' });
  });
  await page.route('**/api/lab/seo/outreach-contacts/import**', async (r) => {
    await fulfill(r, { backendUp: true, imported: 3 });
  });
  await page.route('**/api/lab/seo/outreach-contacts/*/suppress**', async (r) => {
    await fulfill(r, MOCK_SUPPRESS_CONTACT);
  });

  /* Outreach campaigns */
  await page.route('**/api/lab/seo/outreach-campaigns**', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_OUTREACH_CAMPAIGNS);
    else await fulfill(r, MOCK_CREATE_CAMPAIGN);
  });

  /* Outreach drafts */
  await page.route('**/api/lab/seo/outreach-drafts**', async (r) => {
    await fulfill(r, MOCK_OUTREACH_DRAFTS);
  });
  await page.route('**/api/lab/seo/outreach-drafts/*/send**', async (r) => {
    await fulfill(r, MOCK_DRAFT_SEND);
  });
  await page.route('**/api/lab/seo/outreach-drafts/*/approve**', async (r) => {
    await fulfill(r, MOCK_DRAFT_APPROVE);
  });
  await page.route('**/api/lab/seo/outreach-drafts/*/stop-followup**', async (r) => {
    await fulfill(r, MOCK_STOP_FOLLOWUP);
  });

  /* Link placements */
  await page.route('**/api/lab/seo/link-placements**', async (r) => {
    await fulfill(r, { backendUp: true, placements: [] });
  });

  /* Resolve issue */
  await page.route('**/api/lab/seo/issues/*/resolve**', async (r) => {
    await fulfill(r, MOCK_RESOLVE_ISSUE);
  });

  /* Billing usage */
  await page.route('**/api/lab/billing/usage**', async (r) => {
    if (up) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BILLING_USAGE),
      });
    } else {
      await r.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    }
  });

  /* Connections & Google */
  await page.route('**/api/lab/seo/connections**', async (r) => {
    if (r.request().method() === 'GET') await fulfill(r, MOCK_CONNECTIONS);
    else await fulfill(r, { backendUp: true, status: 'connected' });
  });
  await page.route('**/api/lab/seo/google-search-console**', async (r) => {
    await fulfill(r, MOCK_GOOGLE_PROPERTIES);
  });
  await page.route('**/api/lab/seo/google-properties**', async (r) => {
    await fulfill(r, MOCK_GOOGLE_PROPERTIES);
  });
  await page.route('**/api/lab/seo/gsc-sync**', async (r) => {
    await fulfill(r, { backendUp: true, status: 'syncing' });
  });

  /* History */
  await page.route('**/api/lab/seo/history**', async (r) => {
    await fulfill(r, {
      backendUp: true,
      audits: [
        { id: 'audit-001', website_url: 'https://example.com', created_at: '2025-01-01T00:00:00Z', score: 78, issue_count: 15 },
      ],
    });
  });

  /* Audit */
  await page.route('**/api/lab/seo/audit**', async (r) => {
    await fulfill(r, {
      backendUp: true,
      audit: { id: 'audit-001', website_url: 'https://example.com', score: 78, created_at: '2025-01-01T00:00:00Z' },
      issues: [],
    });
  });

  /* Alerts */
  await page.route('**/api/lab/seo/alerts**', async (r) => {
    await fulfill(r, { backendUp: true, alerts: [] });
  });

  /* Competitors */
  await page.route('**/api/lab/seo/competitors**', async (r) => {
    await fulfill(r, { backendUp: true, competitors: [] });
  });

  /* Scheduler */
  await page.route('**/api/lab/seo/scheduler**', async (r) => {
    await fulfill(r, { backendUp: true, healthy: true, jobs: [] });
  });

  /* PageSpeed (CWV) */
  await page.route('**/api/lab/seo/pagespeed**', async (r) => {
    await fulfill(r, {
      backendUp: true,
      collected_at: new Date().toISOString(),
      source: 'pagespeed_api',
      mobile: { performance_score: 72, lcp_ms: 2400, cls: 0.08, inp_ms: 180, fcp_ms: 1200, tbt_ms: 320, ttfb_ms: 480 },
      desktop: { performance_score: 91, lcp_ms: 1100, cls: 0.02, inp_ms: 80, fcp_ms: 600, tbt_ms: 120, ttfb_ms: 180 },
    });
  });

  /* Supabase auth — not real auth, just prevent auth redirects */
  await page.route('**/auth/**', async (r) => {
    await r.continue();
  });
}
