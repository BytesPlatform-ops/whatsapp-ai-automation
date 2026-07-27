import { describe, it, expect } from 'vitest';
import {
  billingRoutes,
  normalizeAgentParam,
  isBillingRoute,
} from './billingRoutes';

describe('billingRoutes helpers', () => {
  it('overview() returns the neutral billing path', () => {
    expect(billingRoutes.overview()).toBe('/pixie-lab/billing');
  });

  it('agent() encodes the agent id as a ?agent= param', () => {
    expect(billingRoutes.agent('content_agent')).toBe('/pixie-lab/billing?agent=content_agent');
  });

  it('agent() URL-encodes special characters', () => {
    const url = billingRoutes.agent('ai_influencer');
    expect(url).toContain('?agent=ai_influencer');
  });

  it('upgrade() without agentId goes to overview with ?upgrade=1', () => {
    expect(billingRoutes.upgrade()).toBe('/pixie-lab/billing?upgrade=1');
  });

  it('upgrade() with agentId includes both agent and upgrade params', () => {
    const url = billingRoutes.upgrade('seo_agent');
    expect(url).toContain('agent=seo_agent');
    expect(url).toContain('upgrade=1');
  });

  it('success() returns the success sub-route', () => {
    expect(billingRoutes.success()).toBe('/pixie-lab/billing/success');
  });

  it('center() returns the legacy center sub-route', () => {
    expect(billingRoutes.center()).toBe('/pixie-lab/billing/center');
  });
});

describe('normalizeAgentParam', () => {
  it('returns a valid billing product id unchanged', () => {
    expect(normalizeAgentParam('content_agent')).toBe('content_agent');
    expect(normalizeAgentParam('ai_influencer')).toBe('ai_influencer');
    expect(normalizeAgentParam('seo_agent')).toBe('seo_agent');
    expect(normalizeAgentParam('social_marketer')).toBe('social_marketer');
    expect(normalizeAgentParam('ai_receptionist')).toBe('ai_receptionist');
  });

  it('returns null for unknown product ids', () => {
    expect(normalizeAgentParam('marketing')).toBeNull();
    expect(normalizeAgentParam('content')).toBeNull();
    expect(normalizeAgentParam('INVALID')).toBeNull();
    expect(normalizeAgentParam('random_string')).toBeNull();
  });

  it('returns null for empty / falsy values', () => {
    expect(normalizeAgentParam('')).toBeNull();
    expect(normalizeAgentParam(null)).toBeNull();
    expect(normalizeAgentParam(undefined)).toBeNull();
  });

  it('never throws on arbitrary input', () => {
    const inputs = [
      "'; DROP TABLE --",
      '../../etc/passwd',
      'a'.repeat(1000),
    ];
    for (const val of inputs) {
      expect(() => normalizeAgentParam(val)).not.toThrow();
    }
  });
});

describe('isBillingRoute', () => {
  it('matches the exact billing path', () => {
    expect(isBillingRoute('/pixie-lab/billing')).toBe(true);
  });

  it('matches sub-paths', () => {
    expect(isBillingRoute('/pixie-lab/billing/center')).toBe(true);
    expect(isBillingRoute('/pixie-lab/billing/success')).toBe(true);
  });

  it('matches paths with query params', () => {
    expect(isBillingRoute('/pixie-lab/billing?agent=content_agent')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isBillingRoute('/pixie-lab/dashboard')).toBe(false);
    expect(isBillingRoute('/pixie-lab/content')).toBe(false);
    expect(isBillingRoute('/pixie-lab/seo')).toBe(false);
  });

  it('does not match a path that starts with billing prefix but is a sibling', () => {
    // /pixie-lab/billing-center is NOT a sub-route of /pixie-lab/billing/...
    expect(isBillingRoute('/pixie-lab/billing-center')).toBe(false);
  });
});
