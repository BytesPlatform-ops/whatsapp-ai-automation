import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentPageShell } from './AgentPageShell';

describe('AgentPageShell — no in-page Content tab bar', () => {
  it('renders the header and children', () => {
    render(<AgentPageShell title="Publishing queue" subtitle="Manage jobs"><div>body</div></AgentPageShell>);
    expect(screen.getByText('Publishing queue')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('does not render the horizontal ServiceTabs navigation', () => {
    render(<AgentPageShell title="T" subtitle="S"><div>body</div></AgentPageShell>);
    // ServiceTabs exposes scroll arrows / a "Content sections" nav — none should exist here.
    expect(screen.queryByLabelText('Scroll tabs right')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Scroll tabs left')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Content sections' })).not.toBeInTheDocument();
    // the section tab links must not appear in the page body anymore
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/pixie-lab/content/generated');
    expect(hrefs).not.toContain('/pixie-lab/content-creator');
  });
});
