import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ContentTypeSpec } from '@/lib/pixie-lab/contentAgentTypes';
import { GenerationForm } from './GenerationForm';

const SPEC: ContentTypeSpec = {
  content_type: 'social_post',
  label: 'Social media post',
  icon: 'megaphone',
  description: 'A post',
  example: 'e.g.',
  structured: false,
  fields: [
    { name: 'platform', label: 'Platform', kind: 'select', required: true, options: ['instagram', 'linkedin'] },
    { name: 'topic', label: 'Topic', kind: 'textarea', required: true },
    { name: 'audience', label: 'Audience', kind: 'text' },
  ],
  controls: [
    { name: 'tone', label: 'Tone', kind: 'select', options: ['friendly', 'bold'] },
    { name: 'variations', label: 'Variations', kind: 'number' },
  ],
};

describe('GenerationForm', () => {
  it('renders type-specific fields and controls with labels', () => {
    render(<GenerationForm spec={SPEC} busy={false} onBack={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.getByLabelText(/Platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Topic/i)).toBeInTheDocument();
    expect(screen.getByText(/Output controls/i)).toBeInTheDocument();
  });

  it('blocks generation and shows inline errors when required fields are empty', () => {
    const onGenerate = vi.fn();
    render(<GenerationForm spec={SPEC} busy={false} onBack={vi.fn()} onGenerate={onGenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));
    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByText(/Platform is required/i)).toBeInTheDocument();
  });

  it('generates with a partitioned payload (fields→inputs, controls→options)', () => {
    const onGenerate = vi.fn();
    render(<GenerationForm spec={SPEC} busy={false} onBack={vi.fn()} onGenerate={onGenerate} />);
    fireEvent.change(screen.getByLabelText(/Platform/i), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: 'summer sale' } });
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const [payload, save] = onGenerate.mock.calls[0];
    expect(save).toBe(false);
    expect(payload.inputs.topic).toBe('summer sale');
    expect(payload.options.platform).toBe('instagram');
  });

  it('passes save=true from Generate & save', () => {
    const onGenerate = vi.fn();
    render(<GenerationForm spec={SPEC} busy={false} onBack={vi.fn()} onGenerate={onGenerate} />);
    fireEvent.change(screen.getByLabelText(/Platform/i), { target: { value: 'linkedin' } });
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: 'launch' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate & save/i }));
    expect(onGenerate.mock.calls[0][1]).toBe(true);
  });

  it('shows a server error when provided', () => {
    render(<GenerationForm spec={SPEC} busy={false} serverError="Provider is down" onBack={vi.fn()} onGenerate={vi.fn()} />);
    expect(screen.getByText(/Provider is down/i)).toBeInTheDocument();
  });
});
