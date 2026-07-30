import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getKnowledgeSources: vi.fn(),
    addTextSource: vi.fn(),
    addWebsiteSource: vi.fn(),
    uploadPdfSource: vi.fn(),
    reindexSource: vi.fn(),
    archiveSource: vi.fn(),
    deleteSource: vi.fn(),
    retrievalTest: vi.fn(),
  },
}));

import KnowledgeSourcesPanel from './KnowledgeSourcesPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const getSources = vi.mocked(receptionistApi.getKnowledgeSources);
const addText = vi.mocked(receptionistApi.addTextSource);
const addWebsite = vi.mocked(receptionistApi.addWebsiteSource);
const retrieval = vi.mocked(receptionistApi.retrievalTest);

beforeEach(() => {
  vi.clearAllMocks();
  getSources.mockResolvedValue({ backendUp: true, sources: [
    { id: 'ksrc_1', source_type: 'pdf', title: 'policy.pdf', index_status: 'indexed', chunk_count: 3, page_count: 2 },
  ] } as never);
});

describe('KnowledgeSourcesPanel', () => {
  it('renders sources with honest index status', async () => {
    render(<KnowledgeSourcesPanel />);
    expect(await screen.findByText('policy.pdf')).toBeInTheDocument();
    expect(screen.getByText('Indexed')).toBeInTheDocument();
    expect(screen.getByText(/3 chunks/)).toBeInTheDocument();
  });

  it('shows offline state when the backend is down', async () => {
    getSources.mockResolvedValue({ backendUp: false } as never);
    render(<KnowledgeSourcesPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });

  it('adds a text source and reloads', async () => {
    addText.mockResolvedValue({ backendUp: true, source: { id: 'ksrc_2', source_type: 'text' } } as never);
    render(<KnowledgeSourcesPanel />);
    await screen.findByText('policy.pdf');
    fireEvent.change(screen.getByPlaceholderText(/Paste text/i), { target: { value: 'We open at 9.' } });
    fireEvent.click(screen.getByRole('button', { name: /Add text/i }));
    await waitFor(() => expect(addText).toHaveBeenCalledWith('', 'We open at 9.'));
    expect(getSources).toHaveBeenCalledTimes(2); // initial + after add
  });

  it('surfaces a rejected website URL error without a fake success', async () => {
    addWebsite.mockResolvedValue({ backendUp: true, error: 'blocked' } as never);
    render(<KnowledgeSourcesPanel />);
    await screen.findByText('policy.pdf');
    fireEvent.change(screen.getByPlaceholderText(/example\.com/i), { target: { value: 'http://localhost/x' } });
    fireEvent.click(screen.getByRole('button', { name: /Add website/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('retrieval test shows a knowledge gap honestly', async () => {
    retrieval.mockResolvedValue({ backendUp: true, confident: false, outcome: 'knowledge_gap', answer: '', evidence: [], method: 'none' } as never);
    render(<KnowledgeSourcesPanel />);
    await screen.findByText('policy.pdf');
    fireEvent.change(screen.getByTestId('retrieval-query'), { target: { value: 'unknown thing' } });
    fireEvent.click(screen.getByRole('button', { name: /Test/i }));
    expect(await screen.findByText(/Knowledge gap/i)).toBeInTheDocument();
  });

  it('retrieval test shows evidence with source + score', async () => {
    retrieval.mockResolvedValue({ backendUp: true, confident: true, outcome: 'answer', method: 'structured_field', answer: 'We open 9-5',
      evidence: [{ source_id: 'profile:hours', chunk_id: 'hours', source_type: 'pdf', text: 'We open 9am to 5pm', score: 2.5, method: 'structured_field' }] } as never);
    render(<KnowledgeSourcesPanel />);
    await screen.findByText('policy.pdf');
    fireEvent.change(screen.getByTestId('retrieval-query'), { target: { value: 'hours' } });
    fireEvent.click(screen.getByRole('button', { name: /Test/i }));
    expect(await screen.findByText(/We open 9am to 5pm/)).toBeInTheDocument();
    expect(screen.getByText(/score 2\.50/)).toBeInTheDocument();
  });
});
