import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const pathname = vi.fn(() => '/pixie-lab/content');
vi.mock('next/navigation', () => ({ usePathname: () => pathname() }));
// Real next/link forwards refs — mirror that so the active-tab ref resolves.
vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, { href: string; children: React.ReactNode }>(
    ({ href, children, ...rest }, ref) => <a ref={ref} href={href} {...rest}>{children}</a>,
  ),
}));

import { ServiceTabs } from './ServiceTabs';

const TABS = [
  { label: 'Overview', href: '/pixie-lab/content' },
  { label: 'Content Agent', href: '/pixie-lab/content/agent' },
  { label: 'Generated Content', href: '/pixie-lab/content/generated' },
  { label: 'Publishing', href: '/pixie-lab/content/publishing' },
  { label: 'Calendar', href: '/pixie-lab/content/publishing/calendar' },
  { label: 'Upload Media', href: '/pixie-lab/content/create' },
  { label: 'Media Library', href: '/pixie-lab/content/library' },
  { label: 'AI Influencer', href: '/pixie-lab/content-creator' },
];

function setMetrics(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  const nav = document.querySelector('nav') as HTMLElement;
  Object.defineProperty(nav, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(nav, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(nav, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true });
  return nav;
}

beforeEach(() => {
  pathname.mockReturnValue('/pixie-lab/content');
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } as unknown as MediaQueryList));
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollBy = vi.fn();
});

describe('ServiceTabs — overflow + routing', () => {
  it('renders every tab including the last (AI Influencer)', () => {
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    for (const t of TABS) expect(screen.getByText(t.label)).toBeInTheDocument();
    // last tab is a real, clickable link with the correct destination
    expect(screen.getByText('AI Influencer').closest('a')).toHaveAttribute('href', '/pixie-lab/content-creator');
  });

  it('tabs do not wrap (whitespace-nowrap)', () => {
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    expect(screen.getByText('AI Influencer').closest('a')!.className).toContain('whitespace-nowrap');
  });

  it('marks the exact-match tab active with aria-current', () => {
    pathname.mockReturnValue('/pixie-lab/content/agent');
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    expect(screen.getByText('Content Agent').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Overview').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent tab for a nested detail route (longest-prefix)', () => {
    pathname.mockReturnValue('/pixie-lab/content/generated/doc_123');
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    expect(screen.getByText('Generated Content').closest('a')).toHaveAttribute('aria-current', 'page');
    // Overview (also a prefix) must NOT win
    expect(screen.getByText('Overview').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('does not distinguish publishing vs calendar incorrectly', () => {
    pathname.mockReturnValue('/pixie-lab/content/publishing/calendar');
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    expect(screen.getByText('Calendar').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Publishing').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('shows no scroll arrows when content fits', () => {
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    setMetrics(200, 800);              // fits
    fireEvent(window, new Event('resize'));
    expect(screen.queryByLabelText('Scroll tabs right')).not.toBeInTheDocument();
  });

  it('shows a right arrow when tabs overflow and scrolls on click', () => {
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    setMetrics(1200, 400, 0);          // overflow to the right
    fireEvent(window, new Event('resize'));
    const right = screen.getByLabelText('Scroll tabs right');
    expect(right).toBeInTheDocument();
    fireEvent.click(right);
    expect(Element.prototype.scrollBy).toHaveBeenCalled();
  });

  it('auto-scrolls the active tab into view', () => {
    pathname.mockReturnValue('/pixie-lab/content-creator');
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('scrolls a keyboard-focused tab into view', () => {
    render(<ServiceTabs tabs={TABS} accent="#D4AF37" />);
    (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.focus(screen.getByText('Media Library').closest('a')!);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
