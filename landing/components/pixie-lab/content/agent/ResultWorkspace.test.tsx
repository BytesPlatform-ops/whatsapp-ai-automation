import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GenerationResult } from '@/lib/pixie-lab/contentAgentTypes';
import { ResultWorkspace } from './ResultWorkspace';

function result(): GenerationResult {
  return {
    content_type: 'social_post',
    usage: { provider: 'mock', model: 'mock', mock: true, tokens: 0, estimated_cost: 0, prompt_version: 'content_agent_v1' },
    variations: [
      { index: 0, title: 'Var one', text: 'first variation text', structured: {} },
      { index: 1, title: 'Var two', text: 'second variation text', structured: {} },
    ],
  };
}

const props = () => ({
  contentType: 'social_post' as const,
  result: result(),
  busy: false,
  onSave: vi.fn(),
  onRegenerate: vi.fn(),
  onBackToForm: vi.fn(),
});

describe('ResultWorkspace', () => {
  it('renders variation tabs and the active variation text', () => {
    render(<ResultWorkspace {...props()} />);
    expect(screen.getByRole('tab', { name: /Variation 1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Variation 2/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/first variation text/i)).toBeInTheDocument();
  });

  it('shows a Mock badge', () => {
    render(<ResultWorkspace {...props()} />);
    expect(screen.getByText('Mock')).toBeInTheDocument();
  });

  it('switches variation when a tab is clicked', () => {
    render(<ResultWorkspace {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Variation 2/i }));
    expect(screen.getByDisplayValue(/second variation text/i)).toBeInTheDocument();
  });

  it('saves the preferred variation', () => {
    const p = props();
    render(<ResultWorkspace {...p} />);
    // mark variation 2 preferred, then save
    fireEvent.click(screen.getByRole('tab', { name: /Variation 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mark preferred/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save variation 2/i }));
    expect(p.onSave).toHaveBeenCalledTimes(1);
    expect(p.onSave.mock.calls[0][0].text).toBe('second variation text');
  });

  it('calls onRegenerate', () => {
    const p = props();
    render(<ResultWorkspace {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));
    expect(p.onRegenerate).toHaveBeenCalled();
  });

  it('lets the user edit variation text before saving', () => {
    const p = props();
    render(<ResultWorkspace {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    fireEvent.change(screen.getByLabelText(/Generated text/i), { target: { value: 'my edited copy' } });
    fireEvent.click(screen.getByRole('button', { name: /Save variation 1|Save to library/i }));
    expect(p.onSave.mock.calls[0][0].text).toBe('my edited copy');
  });
});
