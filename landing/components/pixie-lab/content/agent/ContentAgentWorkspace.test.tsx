import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getContentTypes = vi.fn();
const getAgentStatus = vi.fn();
const generateContent = vi.fn();
const saveGenerated = vi.fn();

vi.mock('@/lib/pixie-lab/contentAgentClient', () => ({
  getContentTypes: (...a: unknown[]) => getContentTypes(...a),
  getAgentStatus: (...a: unknown[]) => getAgentStatus(...a),
  generateContent: (...a: unknown[]) => generateContent(...a),
  saveGenerated: (...a: unknown[]) => saveGenerated(...a),
  // DocumentEditor deps (not exercised in these tests)
  getDocument: vi.fn(), getVersions: vi.fn(), createManualVersion: vi.fn(),
  regenerateDocument: vi.fn(), restoreDocument: vi.fn(), setCurrentVersion: vi.fn(),
  updateDocument: vi.fn(), archiveDocument: vi.fn(),
}));

import { ContentAgentWorkspace } from './ContentAgentWorkspace';

const SOCIAL = {
  content_type: 'social_post', label: 'Social media post', icon: 'megaphone',
  description: 'A post', example: 'e.g.', structured: false,
  fields: [
    { name: 'platform', label: 'Platform', kind: 'select', required: true, options: ['instagram'] },
    { name: 'topic', label: 'Topic', kind: 'textarea', required: true },
  ],
  controls: [{ name: 'variations', label: 'Variations', kind: 'number' }],
};

beforeEach(() => {
  getContentTypes.mockResolvedValue({ ok: true, data: { content_types: [SOCIAL] } });
  getAgentStatus.mockResolvedValue({ ok: true, data: { mock: true, mode: 'fake', prompt_version: 'content_agent_v1', provider: 'mock' } });
  generateContent.mockResolvedValue({
    ok: true,
    data: {
      saved: false, content_type: 'social_post',
      result: { content_type: 'social_post', usage: { provider: 'mock', model: 'mock', mock: true, tokens: 0, estimated_cost: 0, prompt_version: 'v' }, variations: [{ index: 0, title: 'Post', text: 'hello world', structured: {} }] },
    },
  });
  saveGenerated.mockResolvedValue({ ok: true, data: { id: 'cadoc_1', document: {}, version: {}, version_id: 'cav_1' } });
});

describe('ContentAgentWorkspace flow', () => {
  it('runs selector → form → result → save', async () => {
    render(<ContentAgentWorkspace />);
    // selector
    fireEvent.click(await screen.findByText('Social media post'));
    // form
    fireEvent.change(await screen.findByLabelText(/Platform/i), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: 'launch' } });
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));
    // result
    await waitFor(() => expect(generateContent).toHaveBeenCalled());
    expect(await screen.findByText(/Generated content/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/hello world/i)).toBeInTheDocument();
    // save
    fireEvent.click(screen.getByRole('button', { name: /Save to library/i }));
    await waitFor(() => expect(saveGenerated).toHaveBeenCalled());
    expect(await screen.findByText(/Saved to your library/i)).toBeInTheDocument();
  });

  it('shows the mock-mode indicator', async () => {
    render(<ContentAgentWorkspace />);
    await screen.findByText('Social media post');
    expect(screen.getByText(/Local mock mode/i)).toBeInTheDocument();
  });

  it('surfaces a generation error without leaving the form', async () => {
    generateContent.mockResolvedValue({ ok: false, error: { kind: 'provider_unavailable', status: 503, message: 'Provider unavailable' } });
    render(<ContentAgentWorkspace />);
    fireEvent.click(await screen.findByText('Social media post'));
    fireEvent.change(await screen.findByLabelText(/Platform/i), { target: { value: 'instagram' } });
    fireEvent.change(screen.getByLabelText(/Topic/i), { target: { value: 'launch' } });
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));
    expect(await screen.findByText(/Provider unavailable/i)).toBeInTheDocument();
  });
});
