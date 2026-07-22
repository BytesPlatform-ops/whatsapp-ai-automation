import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ContentTypeSpec } from '@/lib/pixie-lab/contentAgentTypes';
import { TypeSelector } from './TypeSelector';

function spec(ct: string, label: string, structured = false): ContentTypeSpec {
  return {
    content_type: ct as ContentTypeSpec['content_type'],
    label, icon: 'megaphone', description: `${label} desc`, example: `${label} example`,
    structured, fields: [], controls: [],
  };
}

const TYPES = [spec('social_post', 'Social media post'), spec('blog', 'Blog / article'), spec('carousel', 'Carousel', true)];

describe('TypeSelector', () => {
  it('renders a card per content type', () => {
    render(<TypeSelector types={TYPES} onSelect={vi.fn()} />);
    expect(screen.getByText('Social media post')).toBeInTheDocument();
    expect(screen.getByText('Blog / article')).toBeInTheDocument();
    expect(screen.getByText('Carousel')).toBeInTheDocument();
  });

  it('flags structured types', () => {
    render(<TypeSelector types={TYPES} onSelect={vi.fn()} />);
    expect(screen.getByText('Structured')).toBeInTheDocument();
  });

  it('filters by search query', () => {
    render(<TypeSelector types={TYPES} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Search content types/i), { target: { value: 'blog' } });
    expect(screen.getByText('Blog / article')).toBeInTheDocument();
    expect(screen.queryByText('Social media post')).not.toBeInTheDocument();
  });

  it('calls onSelect with the content type when a card is clicked', () => {
    const onSelect = vi.fn();
    render(<TypeSelector types={TYPES} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Blog / article'));
    expect(onSelect).toHaveBeenCalledWith('blog');
  });

  it('shows a recently-used section only when provided', () => {
    render(<TypeSelector types={TYPES} onSelect={vi.fn()} recent={['carousel']} />);
    expect(screen.getByText('Recently used')).toBeInTheDocument();
  });
});
