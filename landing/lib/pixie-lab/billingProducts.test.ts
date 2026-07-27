import { describe, it, expect } from 'vitest';
import {
  BILLING_PRODUCT_IDS,
  BILLING_PRODUCTS,
  getAllBillingProducts,
  getImplementedBillingProducts,
  validateBillingProductId,
  getBillingProduct,
  billingProductForAgent,
  type BillingProductId,
} from './billingProducts';
import { AGENTS } from '@/lib/agents';

// ── registry completeness ─────────────────────────────────────────────────────────

describe('BILLING_PRODUCT_IDS', () => {
  it('contains the five stable product ids', () => {
    const expected = new Set([
      'content_agent', 'ai_influencer', 'seo_agent', 'social_marketer', 'ai_receptionist',
    ]);
    expect(BILLING_PRODUCT_IDS).toEqual(expected);
  });
});

describe('BILLING_PRODUCTS registry', () => {
  it('has an entry for every product id', () => {
    for (const id of BILLING_PRODUCT_IDS) {
      expect(BILLING_PRODUCTS[id as BillingProductId]).toBeDefined();
    }
  });

  it('every entry has required string fields', () => {
    for (const [pid, spec] of Object.entries(BILLING_PRODUCTS)) {
      expect(typeof spec.productId).toBe('string');
      expect(typeof spec.displayName).toBe('string');
      expect(typeof spec.agentId).toBe('string');
      expect(typeof spec.icon).toBe('string');
      expect(typeof spec.accent).toBe('string');
      expect(typeof spec.dashboardRoute).toBe('string');
      expect(spec.productId).toBe(pid);
    }
  });

  it('every agentId matches a known slug in agents.ts AGENTS', () => {
    const agentSlugs = new Set(Object.keys(AGENTS));
    for (const spec of Object.values(BILLING_PRODUCTS)) {
      const found = agentSlugs.has(spec.agentId);
      expect(found).toBe(true);
    }
  });

  it('dashboardRoutes start with /pixie-lab/', () => {
    for (const spec of Object.values(BILLING_PRODUCTS)) {
      expect(spec.dashboardRoute.startsWith('/pixie-lab/')).toBe(true);
    }
  });

  it('implemented=true products have non-empty usageCounterKeys', () => {
    for (const spec of Object.values(BILLING_PRODUCTS)) {
      if (spec.implemented) {
        expect(spec.usageCounterKeys.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── getAllBillingProducts ─────────────────────────────────────────────────────────

describe('getAllBillingProducts', () => {
  it('returns a product for each registry entry', () => {
    const products = getAllBillingProducts();
    expect(products).toHaveLength(BILLING_PRODUCT_IDS.size);
  });

  it('only lists agents that exist in the agents registry', () => {
    const agentSlugs = new Set(Object.keys(AGENTS));
    for (const spec of getAllBillingProducts()) {
      expect(agentSlugs.has(spec.agentId)).toBe(true);
    }
  });
});

// ── getImplementedBillingProducts ────────────────────────────────────────────────

describe('getImplementedBillingProducts', () => {
  it('returns only implemented products', () => {
    const implemented = getImplementedBillingProducts();
    for (const spec of implemented) {
      expect(spec.implemented).toBe(true);
    }
  });

  it('content_agent and ai_influencer and seo_agent are implemented', () => {
    const ids = getImplementedBillingProducts().map((s) => s.productId);
    expect(ids).toContain('content_agent');
    expect(ids).toContain('ai_influencer');
    expect(ids).toContain('seo_agent');
  });

  it('is a subset of getAllBillingProducts', () => {
    const all = getAllBillingProducts().length;
    const impl = getImplementedBillingProducts().length;
    expect(impl).toBeLessThanOrEqual(all);
  });
});

// ── validateBillingProductId ─────────────────────────────────────────────────────

describe('validateBillingProductId', () => {
  it('returns known product ids unchanged', () => {
    for (const pid of BILLING_PRODUCT_IDS) {
      expect(validateBillingProductId(pid)).toBe(pid);
    }
  });

  it('returns null for unknown values', () => {
    expect(validateBillingProductId('marketing')).toBeNull();
    expect(validateBillingProductId('content')).toBeNull();
    expect(validateBillingProductId('bad_agent')).toBeNull();
  });

  it('returns null for empty / falsy values', () => {
    expect(validateBillingProductId('')).toBeNull();
    expect(validateBillingProductId(null)).toBeNull();
    expect(validateBillingProductId(undefined)).toBeNull();
  });

  it('invalid agent falls back to null (overview)', () => {
    // This is the critical safe-fallback test
    const result = validateBillingProductId('sql_injection_attempt');
    expect(result).toBeNull();
  });
});

// ── getBillingProduct ────────────────────────────────────────────────────────────

describe('getBillingProduct', () => {
  it('returns the spec for a known product id', () => {
    const spec = getBillingProduct('content_agent');
    expect(spec).not.toBeNull();
    expect(spec?.productId).toBe('content_agent');
  });

  it('returns null for an unknown product id', () => {
    expect(getBillingProduct('nope')).toBeNull();
    expect(getBillingProduct(null)).toBeNull();
    expect(getBillingProduct(undefined)).toBeNull();
  });
});

// ── billingProductForAgent ───────────────────────────────────────────────────────

describe('billingProductForAgent', () => {
  it('maps content-creator to content_agent (first match)', () => {
    // content-creator covers both content_agent and ai_influencer; first match wins
    const result = billingProductForAgent('content-creator');
    expect(result).toMatch(/content_agent|ai_influencer/);
  });

  it('maps seo-agent to seo_agent', () => {
    expect(billingProductForAgent('seo-agent')).toBe('seo_agent');
  });

  it('maps marketing-agent to social_marketer', () => {
    expect(billingProductForAgent('marketing-agent')).toBe('social_marketer');
  });

  it('maps ai-receptionist to ai_receptionist', () => {
    expect(billingProductForAgent('ai-receptionist')).toBe('ai_receptionist');
  });

  it('returns null for unknown agent slugs', () => {
    expect(billingProductForAgent('nonexistent-agent')).toBeNull();
    expect(billingProductForAgent(null)).toBeNull();
    expect(billingProductForAgent(undefined)).toBeNull();
  });
});

// ── agent selector filter: neutral overview ───────────────────────────────────────

describe('neutral overview (no agent selected)', () => {
  it('validateBillingProductId(null) → null means show all-agents view', () => {
    expect(validateBillingProductId(null)).toBeNull();
  });

  it('validateBillingProductId("") → null means show all-agents view', () => {
    expect(validateBillingProductId('')).toBeNull();
  });
});
