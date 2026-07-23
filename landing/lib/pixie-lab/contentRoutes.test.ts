import { describe, it, expect } from 'vitest';
import { CONTENT_NAV, contentRoutes, isContentRoute, activeContentHref } from './contentRoutes';

describe('contentRoutes registry', () => {
  it('exposes the eight content sections with registry destinations', () => {
    expect(CONTENT_NAV.map((n) => n.label)).toEqual([
      'Overview', 'Content Agent', 'Generated Content', 'Publishing',
      'Calendar', 'Upload Media', 'Media Library', 'AI Influencer',
    ]);
    expect(CONTENT_NAV.map((n) => n.href)).toEqual([
      '/pixie-lab/content',
      '/pixie-lab/content/agent',
      '/pixie-lab/content/generated',
      '/pixie-lab/content/publishing',
      '/pixie-lab/content/publishing/calendar',
      '/pixie-lab/content/create',
      '/pixie-lab/content/library',
      '/pixie-lab/content-creator',
    ]);
  });

  it('generated() preserves the document id', () => {
    expect(contentRoutes.generated({ doc: 'doc_123' })).toBe('/pixie-lab/content/generated?doc=doc_123');
  });
  it('publishing() preserves a status filter', () => {
    expect(contentRoutes.publishing({ status: 'failed' })).toBe('/pixie-lab/content/publishing?status=failed');
  });
});

describe('isContentRoute', () => {
  it('is true for /content and nested routes', () => {
    expect(isContentRoute('/pixie-lab/content')).toBe(true);
    expect(isContentRoute('/pixie-lab/content/publishing/calendar')).toBe(true);
  });
  it('includes the AI Influencer sibling route', () => {
    expect(isContentRoute('/pixie-lab/content-creator')).toBe(true);
  });
  it('is false for unrelated routes', () => {
    expect(isContentRoute('/pixie-lab/marketing/content')).toBe(false);
    expect(isContentRoute('/pixie-lab/dashboard')).toBe(false);
  });
});

describe('activeContentHref (longest-prefix)', () => {
  it('exact match', () => {
    expect(activeContentHref('/pixie-lab/content/agent')).toBe('/pixie-lab/content/agent');
  });
  it('nested generated detail highlights Generated Content, not Overview', () => {
    expect(activeContentHref('/pixie-lab/content/generated/doc_123')).toBe('/pixie-lab/content/generated');
  });
  it('calendar highlights Calendar only (not Publishing)', () => {
    expect(activeContentHref('/pixie-lab/content/publishing/calendar')).toBe('/pixie-lab/content/publishing/calendar');
  });
  it('publishing job detail highlights Publishing', () => {
    expect(activeContentHref('/pixie-lab/content/publishing')).toBe('/pixie-lab/content/publishing');
  });
  it('AI Influencer route highlights AI Influencer', () => {
    expect(activeContentHref('/pixie-lab/content-creator')).toBe('/pixie-lab/content-creator');
  });
  it('overview exactly highlights Overview', () => {
    expect(activeContentHref('/pixie-lab/content')).toBe('/pixie-lab/content');
  });
  it('returns empty for a non-content route', () => {
    expect(activeContentHref('/pixie-lab/dashboard')).toBe('');
  });
});
