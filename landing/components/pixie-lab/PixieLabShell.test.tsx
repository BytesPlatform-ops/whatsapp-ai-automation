import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef } from 'react';
import { render, screen } from '@testing-library/react';

const pathname = vi.fn(() => '/pixie-lab/content/agent');
vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, { href: string; children: React.ReactNode }>(
    ({ href, children, ...rest }, ref) => <a ref={ref} href={href} {...rest}>{children}</a>,
  ),
}));
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={String(p.alt ?? '')} /> }));
vi.mock('@/lib/pixie-lab/useEntitlements', () => ({ useEntitlements: () => ({ stateOf: () => 'active' }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }), supabaseConfigured: () => false }));
vi.mock('./theme/ThemeToggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('./ServiceSwitcher', () => ({ ServiceSwitcher: () => <div /> }));
vi.mock('./ProfileMenu', () => ({ ProfileMenu: () => <div /> }));
vi.mock('@/lib/pixie-lab/feed', () => ({
  AGENT_META: {
    website: { label: 'Website' }, receptionist: { label: 'Receptionist' }, seo: { label: 'SEO' },
    marketing: { label: 'Marketing' }, content: { label: 'Content' }, pixie: { label: 'Pixie' },
  },
}));

import { PixieLabShell } from './PixieLabShell';

const NAV = [
  '/pixie-lab/content', '/pixie-lab/content/agent', '/pixie-lab/content/generated',
  '/pixie-lab/content/publishing', '/pixie-lab/content/publishing/calendar',
  '/pixie-lab/content/create', '/pixie-lab/content/library', '/pixie-lab/content-creator',
];

function shell() {
  return <PixieLabShell name="Ada" tenant="t1" workspaceName="WS"><div>page</div></PixieLabShell>;
}
function hrefs() {
  return Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
}
function activeHrefs() {
  return Array.from(document.querySelectorAll('a[aria-current="page"]')).map((a) => a.getAttribute('href'));
}

beforeEach(() => {
  pathname.mockReturnValue('/pixie-lab/content/agent');
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } as unknown as MediaQueryList));
  Element.prototype.scrollIntoView = vi.fn();
});

describe('PixieLabShell — Content sidebar navigation', () => {
  it('shows all eight Content submenu items on a content route', () => {
    render(shell());
    for (const h of NAV) expect(hrefs()).toContain(h);
    // labels are user-facing
    expect(screen.getByText('Generated Content')).toBeInTheDocument();
    expect(screen.getByText('AI Influencer')).toBeInTheDocument();
    expect(screen.getByText('Upload Media')).toBeInTheDocument();
    expect(screen.getByText('Media Library')).toBeInTheDocument();
  });

  it('no longer shows the old Create/Library-only submenu', () => {
    render(shell());
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
    expect(screen.queryByText('Library')).not.toBeInTheDocument();
  });

  it('highlights exactly the active child (Content Agent)', () => {
    render(shell());
    expect(activeHrefs()).toEqual(['/pixie-lab/content/agent']);
  });

  it('nested generated detail highlights Generated Content', () => {
    pathname.mockReturnValue('/pixie-lab/content/generated/doc_123');
    render(shell());
    expect(activeHrefs()).toEqual(['/pixie-lab/content/generated']);
  });

  it('calendar route highlights Calendar only (not Publishing)', () => {
    pathname.mockReturnValue('/pixie-lab/content/publishing/calendar');
    render(shell());
    expect(activeHrefs()).toEqual(['/pixie-lab/content/publishing/calendar']);
  });

  it('AI Influencer route highlights AI Influencer and keeps the submenu open', () => {
    pathname.mockReturnValue('/pixie-lab/content-creator');
    render(shell());
    expect(hrefs()).toContain('/pixie-lab/content-creator');   // submenu visible off a sibling route
    expect(activeHrefs()).toEqual(['/pixie-lab/content-creator']);
  });

  it('does not show the Content submenu when outside the section', () => {
    pathname.mockReturnValue('/pixie-lab/dashboard');
    render(shell());
    expect(hrefs()).not.toContain('/pixie-lab/content/generated');
  });

  it('auto-scrolls the active submenu item into view', () => {
    render(shell());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
